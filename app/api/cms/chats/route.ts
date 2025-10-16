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
  rateLimit
} from '@/lib/api-middleware';
import { jsonDb } from '@/lib/json-db';
import { createChatSchema, updateChatSchema, chatQuerySchema } from '@/lib/validations';

// Rate limiting: 100 requests per minute
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 100 });

// GET /api/cms/chats - Retrieve chats
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

    // Validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryResult = validateQuery(chatQuerySchema, searchParams);
    if (queryResult instanceof NextResponse) {
      return addSecurityHeaders(queryResult);
    }

    const { user } = authResult;
    const { page, limit, assignedAgentId, contactId, status, priority, tags, hasUnread } = queryResult;

    // Log request
    logRequest(request, user.id);

    // Get chats
    let chats = await jsonDb.getChats();
    
    // Apply filters based on user role
    if (user.role === 'agent') {
      // Agents can only see their assigned chats
      chats = chats.filter(chat => chat.assignedAgentId === user.id);
    } else if (assignedAgentId) {
      // Admin can filter by agent
      chats = chats.filter(chat => chat.assignedAgentId === assignedAgentId);
    }

    if (contactId) {
      chats = chats.filter(chat => chat.contactId === contactId);
    }

    if (status) {
      chats = chats.filter(chat => chat.status === status);
    }

    if (priority) {
      chats = chats.filter(chat => chat.priority === priority);
    }

    if (tags && tags.length > 0) {
      chats = chats.filter(chat => 
        tags.some(tag => chat.tags.includes(tag))
      );
    }

    if (typeof hasUnread === 'boolean') {
      chats = chats.filter(chat => 
        hasUnread ? chat.unreadCount > 0 : chat.unreadCount === 0
      );
    }

    // Sort by last message activity (most recent first)
    chats.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    // Apply pagination
    const total = chats.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedChats = chats.slice(startIndex, endIndex);

    // Enrich with contact and agent details
    const enrichedChats = await Promise.all(
      paginatedChats.map(async (chat) => {
        const contact = await jsonDb.getContacts().then(contacts => 
          contacts.find(c => c.id === chat.contactId)
        );
        
        let assignedAgent = null;
        if (chat.assignedAgentId) {
          assignedAgent = await jsonDb.getUserById(chat.assignedAgentId);
        }

        return {
          ...chat,
          contact: contact ? {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            avatar: contact.avatar,
            company: contact.company
          } : null,
          assignedAgent: assignedAgent ? {
            id: assignedAgent.id,
            name: assignedAgent.name,
            avatar: assignedAgent.avatar
          } : null
        };
      })
    );

    const response = successResponse(enrichedChats, {
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
    console.error('Error in GET /api/cms/chats:', error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to retrieve chats', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// POST /api/cms/chats - Create a new chat
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

    // Agents and admins can create chats
    const authzResult = authorize(['agent', 'admin'])(authResult);
    if (authzResult instanceof NextResponse) {
      return addSecurityHeaders(authzResult);
    }

    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);
    
    const validationResult = validateBody(createChatSchema)(sanitizedBody);
    if (validationResult instanceof NextResponse) {
      return addSecurityHeaders(validationResult);
    }

    const { user } = authResult;
    const chatData = validationResult;

    // Log request
    logRequest(request, user.id);

    // Ensure contact exists
    const contact = await jsonDb.getContacts().then(contacts => 
      contacts.find(c => c.id === chatData.contactId)
    );

    if (!contact) {
      return addSecurityHeaders(
        errorResponse('CONTACT_NOT_FOUND', 'Contact not found', 404)
      );
    }

    // If agent is creating chat, assign it to themselves unless specified otherwise
    if (user.role === 'agent' && !chatData.assignedAgentId) {
      chatData.assignedAgentId = user.id;
    }

    // If agent tries to assign to someone else, deny
    if (user.role === 'agent' && chatData.assignedAgentId && chatData.assignedAgentId !== user.id) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Agents can only create chats for themselves', 403)
      );
    }

    // Check if chat already exists for this contact
    const existingChats = await jsonDb.getChats(chatData.assignedAgentId);
    const existingChat = existingChats.find(chat => chat.contactId === chatData.contactId);
    
    if (existingChat) {
      return addSecurityHeaders(
        errorResponse('CHAT_ALREADY_EXISTS', 'Chat already exists for this contact', 409)
      );
    }

    // Create chat
    const newChat = await jsonDb.createChat(chatData);

    const response = successResponse(newChat, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error('Error in POST /api/cms/chats:', error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to create chat', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}