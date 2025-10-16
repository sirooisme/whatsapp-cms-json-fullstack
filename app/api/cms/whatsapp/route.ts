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
import { whatsappService } from '@/lib/whatsapp-service';

// Rate limiting: 30 requests per minute for status checks
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 30 });

// GET /api/cms/whatsapp/status - Get WhatsApp connection status
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

    // Get WhatsApp connection status
    const status = await whatsappService.getConnectionStatus(user.id);

    const response = successResponse(status, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error('Error in GET /api/cms/whatsapp/status:', error);
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'Failed to get WhatsApp status', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// POST /api/cms/whatsapp/connect - Connect to WhatsApp
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

    // Parse request body
    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return addSecurityHeaders(
        errorResponse('VALIDATION_ERROR', 'Phone number is required', 400)
      );
    }

    const { user } = authResult;

    // Log request
    logRequest(request, user.id);

    // Check if already connected
    const existingSession = await jsonDb.getWhatsAppSession(user.id);
    if (existingSession && existingSession.status === 'connected') {
      return addSecurityHeaders(
        errorResponse('ALREADY_CONNECTED', 'WhatsApp is already connected', 400)
      );
    }

    // Initialize WhatsApp client
    await whatsappService.initializeClient(user.id, phone);

    // Get initial status
    const status = await whatsappService.getConnectionStatus(user.id);

    const response = successResponse(status, {
      message: 'WhatsApp connection initiated. Please scan QR code if required.',
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error: any) {
    console.error('Error in POST /api/cms/whatsapp/connect:', error);
    return addSecurityHeaders(
      errorResponse('WHATSAPP_CONNECT_ERROR', error.message || 'Failed to connect to WhatsApp', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}

// DELETE /api/cms/whatsapp/disconnect - Disconnect from WhatsApp
export async function DELETE(request: NextRequest) {
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

    // Log request
    logRequest(request, user.id);

    // Disconnect WhatsApp client
    await whatsappService.disconnectClient(user.id);

    const response = successResponse({ 
      message: 'WhatsApp disconnected successfully' 
    }, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error: any) {
    console.error('Error in DELETE /api/cms/whatsapp/disconnect:', error);
    return addSecurityHeaders(
      errorResponse('WHATSAPP_DISCONNECT_ERROR', error.message || 'Failed to disconnect from WhatsApp', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}