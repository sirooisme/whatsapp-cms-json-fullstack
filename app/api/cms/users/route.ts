import { NextRequest, NextResponse } from 'next/server';
import { 
  authenticate, 
  authorize, 
  validateQuery, 
  successResponse, 
  errorResponse,
  addSecurityHeaders,
  logRequest,
  rateLimit
} from '@/lib/api-middleware';
import { jsonDb } from '@/lib/json-db';
import { paginationSchema } from '@/lib/validations';

// Rate limiting: 50 requests per minute for user management
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 50 });

// GET /api/cms/users - Get users (admin only)
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimitMiddleware(request);
    if (rateLimitResult) return rateLimitResult;

    // Authenticate and authorize (admin only)
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) {
      return addSecurityHeaders(authResult);
    }

    const authzResult = authorize(['admin'])(authResult);
    if (authzResult instanceof NextResponse) {
      return addSecurityHeaders(authzResult);
    }

    // Validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryResult = validateQuery(paginationSchema, searchParams);
    if (queryResult instanceof NextResponse) {
      return addSecurityHeaders(queryResult);
    }

    const { user } = authResult;
    const { page, limit } = queryResult;

    // Log request
    logRequest(request, user.id);

    // Get all users
    const users = await jsonDb.getUsers();

    // Sort by creation date (newest first)
    users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const total = users.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = users.slice(startIndex, endIndex);

    // Enrich with WhatsApp connection status and statistics
    const enrichedUsers = await Promise.all(
      paginatedUsers.map(async (userItem) => {
        // Get WhatsApp session
        const session = await jsonDb.getWhatsAppSession(userItem.id);
        
        // Get assigned contacts count
        const contacts = await jsonDb.getContacts();
        const assignedContacts = contacts.filter(contact => contact.assignedAgentId === userItem.id);
        
        // Get assigned chats count
        const chats = await jsonDb.getChats(userItem.id);
        const activeChats = chats.filter(chat => chat.status === 'active');
        
        // Get message count
        const messages = await jsonDb.withLock('messages', 'read', async () => {
          const allMessages = await jsonDb.readJsonFile('messages');
          return allMessages.filter((message: any) => message.agentId === userItem.id).length;
        });

        return {
          ...userItem,
          password: undefined, // Never include password in response
          whatsappConnected: session?.status === 'connected',
          whatsappStatus: session?.status || 'disconnected',
          whatsappPhone: session?.phone,
          stats: {
            assignedContacts: assignedContacts.length,
            totalChats: chats.length,
            activeChats: activeChats.length,
            totalMessages: messages,
            lastLoginAt: userItem.lastLoginAt
          }
        };
      })
    );

    const response = successResponse(enrichedUsers, {
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
    console.error('Error in GET /api/cms/users:', error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to retrieve users', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}