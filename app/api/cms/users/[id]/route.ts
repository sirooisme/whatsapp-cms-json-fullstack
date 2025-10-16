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
  rateLimit
} from '@/lib/api-middleware';
import { jsonDb } from '@/lib/json-db';
import { updateUserSchema } from '@/lib/validations';

// Rate limiting: 50 requests per minute for user management
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 50 });

// GET /api/cms/users/[id] - Get a specific user
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
    const targetUserId = params.id;

    // Log request
    logRequest(request, user.id);

    // Users can only view their own profile, admins can view any
    if (user.role !== 'admin' && user.id !== targetUserId) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'Access denied to this user profile', 403)
      );
    }

    // Get user
    const targetUser = await jsonDb.getUserById(targetUserId);
    if (!targetUser) {
      return addSecurityHeaders(
        errorResponse('USER_NOT_FOUND', 'User not found', 404)
      );
    }

    // Get WhatsApp session
    const session = await jsonDb.getWhatsAppSession(targetUserId);
    
    // Get statistics
    const contacts = await jsonDb.getContacts();
    const assignedContacts = contacts.filter(contact => contact.assignedAgentId === targetUserId);
    
    const chats = await jsonDb.getChats(targetUserId);
    const activeChats = chats.filter(chat => chat.status === 'active');
    
    const messages = await jsonDb.withLock('messages', 'read', async () => {
      const allMessages = await jsonDb.readJsonFile('messages');
      return allMessages.filter((message: any) => message.agentId === targetUserId).length;
    });

    const enrichedUser = {
      ...targetUser,
      password: undefined, // Never include password in response
      whatsappConnected: session?.status === 'connected',
      whatsappStatus: session?.status || 'disconnected',
      whatsappPhone: session?.phone,
      stats: {
        assignedContacts: assignedContacts.length,
        totalChats: chats.length,
        activeChats: activeChats.length,
        totalMessages: messages,
        lastLoginAt: targetUser.lastLoginAt,
        createdAt: targetUser.createdAt
      }
    };

    const response = successResponse(enrichedUser, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error(`Error in GET /api/cms/users/${params.id}:`, error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to retrieve user', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// PUT /api/cms/users/[id] - Update a user
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
    const targetUserId = params.id;

    // Log request
    logRequest(request, user.id);

    // Check permissions
    if (user.role !== 'admin' && user.id !== targetUserId) {
      return addSecurityHeaders(
        errorResponse('INSUFFICIENT_PERMISSIONS', 'You can only update your own profile', 403)
      );
    }

    // Check if target user exists
    const targetUser = await jsonDb.getUserById(targetUserId);
    if (!targetUser) {
      return addSecurityHeaders(
        errorResponse('USER_NOT_FOUND', 'User not found', 404)
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);
    
    const validationResult = validateBody(updateUserSchema)(sanitizedBody);
    if (validationResult instanceof NextResponse) {
      return addSecurityHeaders(validationResult);
    }

    const updateData = validationResult;

    // Non-admins cannot change certain fields
    if (user.role !== 'admin') {
      delete updateData.role;
      delete updateData.isActive;
    }

    // Admins cannot change their own role to avoid locking themselves out
    if (user.role === 'admin' && user.id === targetUserId) {
      delete updateData.role;
    }

    // Cannot change email to one that already exists
    if (updateData.email && updateData.email !== targetUser.email) {
      const existingUser = await jsonDb.getUserByEmail(updateData.email);
      if (existingUser && existingUser.id !== targetUserId) {
        return addSecurityHeaders(
          errorResponse('EMAIL_ALREADY_EXISTS', 'Email already exists', 409)
        );
      }
    }

    // Update user
    const updatedUser = await jsonDb.updateUser(targetUserId, updateData);

    const response = successResponse({
      ...updatedUser,
      password: undefined // Never include password in response
    }, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error: any) {
    console.error(`Error in PUT /api/cms/users/${params.id}:`, error);
    
    // Handle specific error cases
    if (error.message && error.message.includes('already exists')) {
      return addSecurityHeaders(
        errorResponse('EMAIL_ALREADY_EXISTS', error.message, 409, {
          processingTime: Date.now() - startTime
        })
      );
    }

    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to update user', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// DELETE /api/cms/users/[id] - Delete a user (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { user } = authResult;
    const targetUserId = params.id;

    // Log request
    logRequest(request, user.id);

    // Cannot delete yourself
    if (user.id === targetUserId) {
      return addSecurityHeaders(
        errorResponse('CANNOT_DELETE_SELF', 'You cannot delete your own account', 400)
      );
    }

    // Check if user exists
    const targetUser = await jsonDb.getUserById(targetUserId);
    if (!targetUser) {
      return addSecurityHeaders(
        errorResponse('USER_NOT_FOUND', 'User not found', 404)
      );
    }

    // Check if user has assigned contacts or active chats
    const contacts = await jsonDb.getContacts();
    const assignedContacts = contacts.filter(contact => contact.assignedAgentId === targetUserId);
    
    const chats = await jsonDb.getChats(targetUserId);
    const activeChats = chats.filter(chat => chat.status === 'active');
    
    if (assignedContacts.length > 0 || activeChats.length > 0) {
      return addSecurityHeaders(
        errorResponse('USER_HAS_ASSIGNMENTS', 'Cannot delete user with assigned contacts or active chats. Reassign or close them first.', 400)
      );
    }

    // Disconnect WhatsApp if connected
    const session = await jsonDb.getWhatsAppSession(targetUserId);
    if (session) {
      try {
        const { whatsappService } = await import('@/lib/whatsapp-service');
        await whatsappService.disconnectClient(targetUserId);
      } catch (error) {
        console.error('Failed to disconnect WhatsApp for deleted user:', error);
      }
    }

    // Delete user
    await jsonDb.deleteUser(targetUserId);

    const response = successResponse({ 
      message: 'User deleted successfully',
      userId: targetUserId 
    }, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error(`Error in DELETE /api/cms/users/${params.id}:`, error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to delete user', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}