import { NextRequest, NextResponse } from 'next/server';
import { 
  authenticate, 
  authorize, 
  successResponse, 
  errorResponse,
  addSecurityHeaders,
  logRequest,
  rateLimit
} from '@/lib/api-middleware';
import { jsonDb } from '@/lib/json-db';

// Rate limiting: 30 requests per minute
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 30 });

// GET /api/cms/stats - Get dashboard statistics
export async function GET(request: NextRequest) {
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

    // Log request
    logRequest(request, user.id);

    // Get statistics
    const stats = await jsonDb.getStats();

    // Add role-specific additional stats
    let additionalStats = {};

    if (user.role === 'admin') {
      // Admin gets additional system statistics
      const users = await jsonDb.getUsers();
      const sessions = await jsonDb.withLock('sessions', 'read', () => 
        jsonDb.readJsonFile('sessions')
      );
      
      additionalStats = {
        adminUsers: users.filter(u => u.role === 'admin').length,
        agentUsers: users.filter(u => u.role === 'agent').length,
        inactiveUsers: users.filter(u => !u.isActive).length,
        totalSessions: sessions.length,
        connectedDevices: sessions.filter(s => s.status === 'connected').length
      };
    } else {
      // Agents get their personal statistics
      const agentChats = await jsonDb.getChats(user.id);
      const contacts = await jsonDb.getContacts();
      const assignedContacts = contacts.filter(c => c.assignedAgentId === user.id);
      const messages = await jsonDb.withLock('messages', 'read', async () => {
        const allMessages = await jsonDb.readJsonFile('messages');
        return allMessages.filter((message: any) => message.agentId === user.id);
      });

      additionalStats = {
        personalChats: agentChats.length,
        personalActiveChats: agentChats.filter(chat => chat.status === 'active').length,
        assignedContacts: assignedContacts.length,
        personalMessages: messages.length,
        personalContacts: assignedContacts.length
      };
    }

    const response = successResponse({
      ...stats,
      ...additionalStats,
      userRole: user.role
    }, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error('Error in GET /api/cms/stats:', error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to retrieve statistics', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}