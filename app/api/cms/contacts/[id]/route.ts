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
import { updateContactSchema } from '@/lib/validations';

// Rate limiting: 100 requests per minute
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 100 });

// GET /api/cms/contacts/[id] - Get a specific contact
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
    const contactId = params.id;

    // Log request
    logRequest(request, user.id);

    // Get contact
    const contacts = await jsonDb.getContacts();
    const contact = contacts.find(c => c.id === contactId);
    
    if (!contact) {
      return addSecurityHeaders(
        errorResponse('CONTACT_NOT_FOUND', 'Contact not found', 404)
      );
    }

    // Check access permissions (agents can only see their assigned contacts)
    if (user.role === 'agent' && contact.assignedAgentId !== user.id) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Access denied to this contact', 403)
      );
    }

    // Enrich with agent details and chat history
    let assignedAgent = null;
    if (contact.assignedAgentId) {
      assignedAgent = await jsonDb.getUserById(contact.assignedAgentId);
    }

    // Get chat history for this contact
    const allChats = await jsonDb.getChats();
    const contactChats = allChats.filter(chat => chat.contactId === contactId);
    
    // Get messages for statistics
    const messages = await jsonDb.withLock('messages', 'read', () => 
      jsonDb.readJsonFile('messages')
    );
    const contactMessages = messages.filter((message: any) => message.contactId === contactId);

    // Sort chats by last activity
    contactChats.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    const enrichedContact = {
      ...contact,
      assignedAgent: assignedAgent ? {
        id: assignedAgent.id,
        name: assignedAgent.name,
        avatar: assignedAgent.avatar,
        phone: assignedAgent.phone,
        email: assignedAgent.email
      } : null,
      stats: {
        totalChats: contactChats.length,
        activeChats: contactChats.filter(chat => chat.status === 'active').length,
        archivedChats: contactChats.filter(chat => chat.status === 'archived').length,
        closedChats: contactChats.filter(chat => chat.status === 'closed').length,
        totalMessages: contactMessages.length,
        inboundMessages: contactMessages.filter((m: any) => m.direction === 'inbound').length,
        outboundMessages: contactMessages.filter((m: any) => m.direction === 'outbound').length,
        firstMessageAt: contactMessages.length > 0 ? contactMessages[0]?.timestamp : null,
        lastMessageAt: contact.lastMessageAt
      },
      recentChats: contactChats.slice(0, 5).map(chat => ({
        id: chat.id,
        status: chat.status,
        priority: chat.priority,
        unreadCount: chat.unreadCount,
        lastMessageAt: chat.lastMessageAt,
        lastMessagePreview: chat.lastMessagePreview,
        tags: chat.tags,
        assignedAgentId: chat.assignedAgentId
      }))
    };

    const response = successResponse(enrichedContact, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error(`Error in GET /api/cms/contacts/${params.id}:`, error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to retrieve contact', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// PUT /api/cms/contacts/[id] - Update a contact
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
    const contactId = params.id;

    // Log request
    logRequest(request, user.id);

    // Check if contact exists
    const contacts = await jsonDb.getContacts();
    const existingContact = contacts.find(c => c.id === contactId);
    
    if (!existingContact) {
      return addSecurityHeaders(
        errorResponse('CONTACT_NOT_FOUND', 'Contact not found', 404)
      );
    }

    // Check access permissions
    if (user.role === 'agent' && existingContact.assignedAgentId !== user.id) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Access denied to this contact', 403)
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);
    
    const validationResult = validateBody(updateContactSchema)(sanitizedBody);
    if (validationResult instanceof NextResponse) {
      return addSecurityHeaders(validationResult);
    }

    const updateData = validationResult;

    // Agents can only reassign contacts to themselves
    if (user.role === 'agent' && updateData.assignedAgentId && updateData.assignedAgentId !== user.id) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Agents can only reassign contacts to themselves', 403)
      );
    }

    // Update contact
    const updatedContact = await jsonDb.updateContact(contactId, updateData);

    const response = successResponse(updatedContact, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error: any) {
    console.error(`Error in PUT /api/cms/contacts/${params.id}:`, error);
    
    // Handle specific error cases
    if (error.message && error.message.includes('already exists')) {
      return addSecurityHeaders(
        errorResponse('PHONE_ALREADY_EXISTS', error.message, 409, {
          processingTime: Date.now() - startTime
        })
      );
    }

    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to update contact', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// DELETE /api/cms/contacts/[id] - Delete a contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimitMiddleware(request);
    if (rateLimitResult) return rateLimitResult;

    // Authenticate and authorize (only admins can delete contacts)
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) {
      return addSecurityHeaders(authResult);
    }

    const authzResult = authorize(['admin'])(authResult);
    if (authzResult instanceof NextResponse) {
      return addSecurityHeaders(authzResult);
    }

    const { user } = authResult;
    const contactId = params.id;

    // Log request
    logRequest(request, user.id);

    // Check if contact exists
    const contacts = await jsonDb.getContacts();
    const existingContact = contacts.find(c => c.id === contactId);
    
    if (!existingContact) {
      return addSecurityHeaders(
        errorResponse('CONTACT_NOT_FOUND', 'Contact not found', 404)
      );
    }

    // Check if contact has associated chats
    const chats = await jsonDb.getChats();
    const contactChats = chats.filter(chat => chat.contactId === contactId);
    
    if (contactChats.length > 0) {
      return addSecurityHeaders(
        errorResponse('CONTACT_HAS_CHATS', 'Cannot delete contact with existing chats. Archive chats first.', 400)
      );
    }

    // Delete contact
    await jsonDb.deleteContact(contactId);

    const response = successResponse({ 
      message: 'Contact deleted successfully',
      contactId 
    }, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error(`Error in DELETE /api/cms/contacts/${params.id}:`, error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to delete contact', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}