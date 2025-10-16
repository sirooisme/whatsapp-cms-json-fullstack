import { NextRequest, NextResponse } from 'next/server';
import { 
  authenticate, 
  authorize, 
  validateQuery, 
  validateBody, 
  successResponse, 
  errorResponse,
  addSecurityHeaders,
  logRequest,
  sanitizeInput,
  checkResourceAccess,
  rateLimit
} from '@/lib/api-middleware';
import { jsonDb } from '@/lib/json-db';
import { createMessageSchema, messageQuerySchema } from '@/lib/validations';

// Rate limiting: 200 requests per minute (messages can be frequent)
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 200 });

// GET /api/cms/messages - Retrieve messages
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimitMiddleware(request);
    if (rateLimitResult) return rateLimitResult;

    // Authenticate and authorize
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) {
      return addSecurityHeaders(authResult);
    }

    const authzResult = authorize(['agent', 'admin'])(authResult);
    if (authzResult instanceof NextResponse) {
      return addSecurityHeaders(authzResult);
    }

    // Validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryResult = validateQuery(messageQuerySchema, searchParams);
    if (queryResult instanceof NextResponse) {
      return addSecurityHeaders(queryResult);
    }

    const { user } = authResult;
    const { page, limit, chatId, contactId, agentId, type, direction, status, startDate, endDate } = queryResult;

    // Log request
    logRequest(request, user.id);

    // Get all messages
    const messages = await jsonDb.withLock('messages', 'read', () => 
      jsonDb.readJsonFile('messages')
    );

    let filteredMessages = [...messages];

    // Apply filters based on user role
    if (user.role === 'agent') {
      // Agents can only see messages from their assigned chats
      const agentChats = await jsonDb.getChats(user.id);
      const agentChatIds = agentChats.map(chat => chat.id);
      filteredMessages = filteredMessages.filter(message => 
        agentChatIds.includes(message.chatId)
      );
    } else if (agentId) {
      // Admin can filter by agent
      const agentChats = await jsonDb.getChats(agentId);
      const agentChatIds = agentChats.map(chat => chat.id);
      filteredMessages = filteredMessages.filter(message => 
        agentChatIds.includes(message.chatId)
      );
    }

    if (chatId) {
      // Check access to specific chat
      const hasAccess = await checkResourceAccess(user.id, user.role, 'chat', chatId);
      if (!hasAccess) {
        return addSecurityHeaders(
          errorResponse('INSUFFICIENT_PERMISSIONS', 'Access denied to this chat', 403)
        );
      }
      filteredMessages = filteredMessages.filter(message => message.chatId === chatId);
    }

    if (contactId) {
      filteredMessages = filteredMessages.filter(message => message.contactId === contactId);
    }

    if (type) {
      filteredMessages = filteredMessages.filter(message => message.type === type);
    }

    if (direction) {
      filteredMessages = filteredMessages.filter(message => message.direction === direction);
    }

    if (status) {
      filteredMessages = filteredMessages.filter(message => message.status === status);
    }

    if (startDate) {
      const start = new Date(startDate).getTime();
      filteredMessages = filteredMessages.filter(message => 
        new Date(message.timestamp).getTime() >= start
      );
    }

    if (endDate) {
      const end = new Date(endDate).getTime();
      filteredMessages = filteredMessages.filter(message => 
        new Date(message.timestamp).getTime() <= end
      );
    }

    // Sort by timestamp (most recent first)
    filteredMessages.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply pagination
    const total = filteredMessages.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedMessages = filteredMessages.slice(startIndex, endIndex);

    // Enrich with contact and agent details
    const enrichedMessages = await Promise.all(
      paginatedMessages.map(async (message) => {
        const contact = await jsonDb.getContacts().then(contacts => 
          contacts.find(c => c.id === message.contactId)
        );
        
        let agent = null;
        if (message.agentId) {
          agent = await jsonDb.getUserById(message.agentId);
        }

        let chat = null;
        if (message.chatId) {
          chat = await jsonDb.getChatById(message.chatId);
        }

        return {
          ...message,
          contact: contact ? {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            avatar: contact.avatar
          } : null,
          agent: agent ? {
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar
          } : null,
          chat: chat ? {
            id: chat.id,
            status: chat.status,
            priority: chat.priority
          } : null
        };
      })
    );

    const response = successResponse(enrichedMessages, {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error('Error in GET /api/cms/messages:', error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to retrieve messages', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// POST /api/cms/messages - Create a new message (system messages only)
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimitMiddleware(request);
    if (rateLimitResult) return rateLimitResult;

    // Authenticate and authorize
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) {
      return addSecurityHeaders(authResult);
    }

    const authzResult = authorize(['agent', 'admin'])(authResult);
    if (authzResult instanceof NextResponse) {
      return addSecurityHeaders(authzResult);
    }

    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);
    
    const validationResult = validateBody(createMessageSchema)(sanitizedBody);
    if (validationResult instanceof NextResponse) {
      return addSecurityHeaders(validationResult);
    }

    const { user } = authResult;
    const messageData = validationResult;

    // Log request
    logRequest(request, user.id);

    // Check access to the chat
    const hasAccess = await checkResourceAccess(user.id, user.role, 'chat', messageData.chatId);
    if (!hasAccess) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Access denied to this chat', 403)
      );
    }

    // Verify chat exists
    const chat = await jsonDb.getChatById(messageData.chatId);
    if (!chat) {
      return addSecurityHeaders(
        errorResponse('CHAT_NOT_FOUND', 'Chat not found', 404)
      );
    }

    // Verify contact exists
    const contact = await jsonDb.getContacts().then(contacts => 
      contacts.find(c => c.id === messageData.contactId)
    );
    if (!contact) {
      return addSecurityHeaders(
        errorResponse('CONTACT_NOT_FOUND', 'Contact not found', 404)
      );
    }

    // Only allow system messages through this endpoint (WhatsApp messages are handled by the WhatsApp service)
    if (messageData.type !== 'system') {
      return addSecurityHeaders(
        errorResponse('INVALID_MESSAGE_TYPE', 'Only system messages can be created through this endpoint', 400)
      );
    }

    // Set agent ID for system messages
    messageData.agentId = user.id;

    // Create message
    const newMessage = await jsonDb.saveMessage(messageData);

    const response = successResponse(newMessage, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error('Error in POST /api/cms/messages:', error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to create message', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}