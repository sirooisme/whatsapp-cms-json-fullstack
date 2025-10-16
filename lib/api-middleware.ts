import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { jsonDb } from '@/lib/json-db';
import { SecurityService } from '@/lib/security';
import { SecurityMonitor } from '@/lib/security-monitor';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

// Enhanced rate limiting middleware with security monitoring
export function rateLimit(config: RateLimitConfig) {
  return function (request: NextRequest) {
    const clientIp = request.ip || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const pathname = request.nextUrl.pathname;

    // Use enhanced security service for rate limiting
    const result = SecurityService.checkRateLimit(
      `${clientIp}:${pathname}`,
      config.maxRequests,
      config.windowMs
    );

    if (!result.allowed) {
      // Log rate limit violation
      SecurityMonitor.logEvent(
        'RATE_LIMIT_EXCEEDED',
        {
          ip: clientIp,
          userAgent,
          path: pathname,
          resetTime: result.resetTime
        },
        'medium',
        clientIp,
        userAgent
      );

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: {
              resetTime: result.resetTime,
              remainingAttempts: result.remainingAttempts
            }
          },
          timestamp: new Date().toISOString()
        },
        { 
          status: 429,
          headers: SecurityService.getCSPHeaders()
        }
      );
    }

    return null; // Allow request
  };
}

// Enhanced authentication middleware with security monitoring
export async function authenticate(request: NextRequest) {
  const clientIp = request.ip || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session || !session.user) {
      // Log failed authentication
      SecurityMonitor.logEvent(
        'AUTHENTICATION_FAILED',
        {
          ip: clientIp,
          userAgent,
          path: request.nextUrl.pathname,
          reason: 'No session or user'
        },
        'medium',
        clientIp,
        userAgent
      );

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          },
          timestamp: new Date().toISOString()
        },
        { 
          status: 401,
          headers: SecurityService.getCSPHeaders()
        }
      );
    }

    // Get user from database to ensure they exist and get role
    const user = await jsonDb.getUserById(session.user.id!);
    
    if (!user || !user.isActive) {
      // Log access attempt with inactive/deleted account
      SecurityMonitor.logEvent(
        'AUTHENTICATION_FAILED',
        {
          ip: clientIp,
          userAgent,
          userId: session.user.id,
          reason: user ? 'User inactive' : 'User not found',
          path: request.nextUrl.pathname
        },
        'high',
        clientIp,
        userAgent,
        session.user.id
      );

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_INACTIVE',
            message: 'User account is not active'
          },
          timestamp: new Date().toISOString()
        },
        { 
          status: 401,
          headers: SecurityService.getCSPHeaders()
        }
      );
    }

    // Update last login
    await jsonDb.updateUser(user.id, {
      lastLoginAt: new Date().toISOString()
    });

    // Log successful authentication
    SecurityMonitor.logEvent(
      'AUTHENTICATION_SUCCESS',
      {
        ip: clientIp,
        userAgent,
        userId: user.id,
        userRole: user.role,
        path: request.nextUrl.pathname
      },
      'low',
      clientIp,
      userAgent,
      user.id
    );

    return { user, session };
  } catch (error) {
    console.error('Authentication error:', error);
    
    // Log authentication error
    SecurityMonitor.logEvent(
      'AUTHENTICATION_ERROR',
      {
        ip: clientIp,
        userAgent,
        path: request.nextUrl.pathname,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      'high',
      clientIp,
      userAgent
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Failed to authenticate user'
        },
        timestamp: new Date().toISOString()
      },
      { 
        status: 500,
        headers: SecurityService.getCSPHeaders()
      }
    );
  }
}

// Role-based access control middleware
export function authorize(requiredRoles: string[]) {
  return function (authResult: any) {
    if (authResult instanceof NextResponse) {
      return authResult; // Error response from authenticate
    }

    const { user } = authResult;

    if (!requiredRoles.includes(user.role)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Access denied. Required role: ${requiredRoles.join(' or ')}, Current role: ${user.role}`
          },
          timestamp: new Date().toISOString()
        },
        { status: 403 }
      );
    }

    return null; // Authorized
  };
}

// Check if user can access specific resource
export async function checkResourceAccess(
  userId: string,
  userRole: string,
  resourceType: 'contact' | 'chat' | 'message',
  resourceId: string
) {
  // Admins can access everything
  if (userRole === 'admin') {
    return true;
  }

  // Agents can only access their assigned resources
  switch (resourceType) {
    case 'contact':
      const contact = await jsonDb.getContacts().then(contacts => 
        contacts.find(c => c.id === resourceId)
      );
      return contact?.assignedAgentId === userId;

    case 'chat':
      const chat = await jsonDb.getChatById(resourceId);
      return chat?.assignedAgentId === userId;

    case 'message':
      const messages = await jsonDb.readJsonFile('messages');
      const message = messages.find((m: any) => m.id === resourceId);
      if (message?.agentId === userId) {
        return true;
      }
      // Also check if message is in a chat assigned to this agent
      if (message?.chatId) {
        const messageChat = await jsonDb.getChatById(message.chatId);
        return messageChat?.assignedAgentId === userId;
      }
      return false;

    default:
      return false;
  }
}

// Validate request body with Zod schema
export function validateBody<T>(schema: any) {
  return function (request: NextRequest) {
    try {
      return schema.parse(request.body) as T;
    } catch (error: any) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors
          },
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }
  };
}

// Validate query parameters with Zod schema
export function validateQuery<T>(schema: any, searchParams: URLSearchParams) {
  try {
    const query: any = {};
    for (const [key, value] of searchParams.entries()) {
      query[key] = value;
    }
    return schema.parse(query) as T;
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors
        },
        timestamp: new Date().toISOString()
      },
      { status: 400 }
    );
  }
}

// Success response helper
export function successResponse<T>(data: T, meta?: any) {
  return NextResponse.json({
    success: true,
    data,
    ...(meta && { meta }),
    timestamp: new Date().toISOString()
  });
}

// Error response helper
export function errorResponse(
  code: string,
  message: string,
  status: number = 500,
  details?: any
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details && { details })
      },
      timestamp: new Date().toISOString()
    },
    { status }
  );
}

// Enhanced security headers middleware
export function addSecurityHeaders(response: NextResponse) {
  const securityHeaders = SecurityService.getCSPHeaders();
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Additional security headers
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  
  return response;
}

// Request logging middleware
export function logRequest(request: NextRequest, userId?: string) {
  const timestamp = new Date().toISOString();
  const method = request.method;
  const url = request.nextUrl.pathname;
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = request.ip || 'unknown';

  console.log(`[${timestamp}] ${method} ${url} - IP: ${ip} - User: ${userId || 'anonymous'} - UA: ${userAgent}`);
}

// Enhanced input sanitization with security monitoring
export function sanitizeInput(input: any): any {
  const originalInput = typeof input === 'string' ? input : JSON.stringify(input);
  
  // Check for common attack patterns
  if (typeof input === 'string') {
    // Detect SQL injection attempts
    if (SecurityService.detectSQLInjection(input)) {
      SecurityMonitor.logEvent(
        'SQL_INJECTION_ATTEMPT',
        {
          input: originalInput.substring(0, 200), // Limit log size
          type: 'sql_injection'
        },
        'critical'
      );
    }

    // Detect XSS attempts
    if (SecurityService.detectXSS(input)) {
      SecurityMonitor.logEvent(
        'XSS_ATTEMPT',
        {
          input: originalInput.substring(0, 200),
          type: 'xss'
        },
        'high'
      );
    }

    // Detect path traversal attempts
    if (SecurityService.detectPathTraversal(input)) {
      SecurityMonitor.logEvent(
        'PATH_TRAVERSAL_ATTEMPT',
        {
          input: originalInput.substring(0, 200),
          type: 'path_traversal'
        },
        'high'
      );
    }
  }

  // Use the enhanced security service for sanitization
  return SecurityService.sanitizeInput(input);
}

// Combine multiple middleware functions
export function combineMiddleware(...middleware: Function[]) {
  return async (request: NextRequest) => {
    for (const fn of middleware) {
      const result = await fn(request);
      if (result) {
        return result;
      }
    }
    return null;
  };
}