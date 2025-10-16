import { NextRequest, NextResponse } from 'next/server';
import { 
  authenticate, 
  authorize, 
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
import { updateChatSchema } from '@/lib/validations';

// Rate limiting: 100 requests per minute
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 100 });

// GET /api/cms/chats/[id] - Get a specific chat
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimitMiddleware(request);
    if (rateLimitResult) return rateLimitResult;

    // Authenticate
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) {
      return addSecurityHeaders(authResult);
    }

    const { user } = authResult;
    const chatId = params.id;

    // Log request
    logRequest(request, user.id);

    // Get chat
    const chat = await jsonDb.getChatById(chatId);
    if (!chat) {
      return addSecurityHeaders(
        errorResponse('CHAT_NOT_FOUND', 'Chat not found', 404)
      );
    }

    // Check access permissions
    const hasAccess = await checkResourceAccess(user.id, user.role, 'chat', chatId);
    if (!hasAccess) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Access denied to this chat', 403)
      );
    }

    // Enrich with contact and agent details
    const contact = await jsonDb.getContacts().then(contacts => 
      contacts.find(c => c.id === chat.contactId)
    );
    
    let assignedAgent = null;
    if (chat.assignedAgentId) {
      assignedAgent = await jsonDb.getUserById(chat.assignedAgentId);
    }

    // Get recent messages for this chat
    const recentMessages = await jsonDb.getMessages(chatId, 50);

    const enrichedChat = {
      ...chat,
      contact: contact ? {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        avatar: contact.avatar,
        company: contact.company,
        tags: contact.tags,
        notes: contact.notes
      } : null,
      assignedAgent: assignedAgent ? {
        id: assignedAgent.id,
        name: assignedAgent.name,
        avatar: assignedAgent.avatar,
        phone: assignedAgent.phone
      } : null,
      recentMessages: recentMessages.slice(-10) // Last 10 messages
    };

    const response = successResponse(enrichedChat, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error(`Error in GET /api/cms/chats/${params.id}:`, error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to retrieve chat', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// PUT /api/cms/chats/[id] - Update a chat
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { user } = authResult;
    const chatId = params.id;

    // Log request
    logRequest(request, user.id);

    // Check if chat exists
    const existingChat = await jsonDb.getChatById(chatId);
    if (!existingChat) {
      return addSecurityHeaders(
        errorResponse('CHAT_NOT_FOUND', 'Chat not found', 404)
      );
    }

    // Check access permissions
    const hasAccess = await checkResourceAccess(user.id, user.role, 'chat', chatId);
    if (!hasAccess) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Access denied to this chat', 403)
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);
    
    const validationResult = validateBody(updateChatSchema)(sanitizedBody);
    if (validationResult instanceof NextResponse) {
      return addSecurityHeaders(validationResult);
    }

    const updateData = validationResult;

    // Agents can only reassign chats to themselves
    if (user.role === 'agent' && updateData.assignedAgentId && updateData.assignedAgentId !== user.id) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Agents can only reassign chats to themselves', 403)
      );
    }

    // Update chat
    const updatedChat = await jsonDb.updateChat(chatId, updateData);

    const response = successResponse(updatedChat, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error(`Error in PUT /api/cms/chats/${params.id}:`, error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to update chat', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// DELETE /api/cms/chats/[id] - Delete a chat
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimitMiddleware(request);
    if (rateLimitResult) return rateLimitResult;

    // Authenticate and authorize (only admins can delete chats)
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) {
      return addSecurityHeaders(authResult);
    }

    const authzResult = authorize(['admin'])(authResult);
    if (authzResult instanceof NextResponse) {
      return addSecurityHeaders(authzResult);
    }

    const { user } = authResult;
    const chatId = params.id;

    // Log request
    logRequest(request, user.id);

    // Check if chat exists
    const existingChat = await jsonDb.getChatById(chatId);
    if (!existingChat) {
      return addSecurityHeaders(
        errorResponse('CHAT_NOT_FOUND', 'Chat not found', 404)
      );
    }

    // Delete all messages in this chat first
    const messages = await jsonDb.readJsonFile('messages');
    const filteredMessages = messages.filter((message: any) => message.chatId !== chatId);
    await jsonDb.withLock('messages', 'write', async () => {
      await jsonDb.writeJsonFile('messages', filteredMessages);
    });

    // Delete the chat (mark as closed)
    await jsonDb.updateChat(chatId, {
      status: 'closed',
      updatedAt: new Date().toISOString()
    });

    const response = successResponse({ 
      message: 'Chat deleted successfully',
      chatId 
    }, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error(`Error in DELETE /api/cms/chats/${params.id}:`, error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to delete chat', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}