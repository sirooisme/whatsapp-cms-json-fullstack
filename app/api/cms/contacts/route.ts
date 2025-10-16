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
import { createContactSchema, updateContactSchema, contactQuerySchema } from '@/lib/validations';

// Rate limiting: 100 requests per minute
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 100 });

// GET /api/cms/contacts - Retrieve contacts
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
    const queryResult = validateQuery(contactQuerySchema, searchParams);
    if (queryResult instanceof NextResponse) {
      return addSecurityHeaders(queryResult);
    }

    const { user } = authResult;
    const { page, limit, assignedAgentId, isActive, tags, search } = queryResult;

    // Log request
    logRequest(request, user.id);

    // Get contacts
    let contacts = await jsonDb.getContacts();
    
    // Apply filters based on user role
    if (user.role === 'agent') {
      // Agents can only see their assigned contacts
      contacts = contacts.filter(contact => contact.assignedAgentId === user.id);
    } else if (assignedAgentId) {
      // Admin can filter by agent
      contacts = contacts.filter(contact => contact.assignedAgentId === assignedAgentId);
    }

    if (typeof isActive === 'boolean') {
      contacts = contacts.filter(contact => contact.isActive === isActive);
    }

    if (tags && tags.length > 0) {
      contacts = contacts.filter(contact => 
        tags.some(tag => contact.tags.includes(tag))
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      contacts = contacts.filter(contact => 
        contact.name.toLowerCase().includes(searchLower) ||
        contact.phone.includes(search) ||
        (contact.email && contact.email.toLowerCase().includes(searchLower)) ||
        (contact.company && contact.company.toLowerCase().includes(searchLower))
      );
    }

    // Sort by last message activity (most recent first)
    contacts.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    // Apply pagination
    const total = contacts.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedContacts = contacts.slice(startIndex, endIndex);

    // Enrich with agent details and chat statistics
    const enrichedContacts = await Promise.all(
      paginatedContacts.map(async (contact) => {
        let assignedAgent = null;
        if (contact.assignedAgentId) {
          assignedAgent = await jsonDb.getUserById(contact.assignedAgentId);
        }

        // Get chat statistics for this contact
        const allChats = await jsonDb.getChats();
        const contactChats = allChats.filter(chat => chat.contactId === contact.id);
        
        const totalMessages = await jsonDb.withLock('messages', 'read', async () => {
          const messages = await jsonDb.readJsonFile('messages');
          return messages.filter((message: any) => message.contactId === contact.id).length;
        });

        const activeChat = contactChats.find(chat => chat.status === 'active');

        return {
          ...contact,
          assignedAgent: assignedAgent ? {
            id: assignedAgent.id,
            name: assignedAgent.name,
            avatar: assignedAgent.avatar,
            phone: assignedAgent.phone
          } : null,
          stats: {
            totalChats: contactChats.length,
            activeChats: contactChats.filter(chat => chat.status === 'active').length,
            totalMessages,
            lastMessageAt: contact.lastMessageAt
          },
          hasActiveChat: !!activeChat,
          activeChatId: activeChat?.id || null
        };
      })
    );

    const response = successResponse(enrichedContacts, {
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
    console.error('Error in GET /api/cms/contacts:', error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to retrieve contacts', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// POST /api/cms/contacts - Create a new contact
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
    
    const validationResult = validateBody(createContactSchema)(sanitizedBody);
    if (validationResult instanceof NextResponse) {
      return addSecurityHeaders(validationResult);
    }

    const { user } = authResult;
    const contactData = validationResult;

    // Log request
    logRequest(request, user.id);

    // If agent is creating contact, assign it to themselves unless specified otherwise
    if (user.role === 'agent' && !contactData.assignedAgentId) {
      contactData.assignedAgentId = user.id;
    }

    // If agent tries to assign to someone else, deny
    if (user.role === 'agent' && contactData.assignedAgentId && contactData.assignedAgentId !== user.id) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Agents can only create contacts for themselves', 403)
      );
    }

    // Create contact
    const newContact = await jsonDb.createContact(contactData);

    const response = successResponse(newContact, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error: any) {
    console.error('Error in POST /api/cms/contacts:', error);
    
    // Handle specific error cases
    if (error.message && error.message.includes('already exists')) {
      return addSecurityHeaders(
        errorResponse('CONTACT_ALREADY_EXISTS', error.message, 409, {
          processingTime: Date.now() - startTime
        })
      );
    }

    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to create contact', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}