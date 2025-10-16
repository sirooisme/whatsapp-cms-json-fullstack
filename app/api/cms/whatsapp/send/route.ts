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
import { whatsappService } from '@/lib/whatsapp-service';
import { sendMessageSchema } from '@/lib/validations';

// Rate limiting: 60 requests per minute for WhatsApp operations
const rateLimitMiddleware = rateLimit({ windowMs: 60 * 1000, maxRequests: 60 });

// POST /api/cms/whatsapp/send - Send a WhatsApp message
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
    
    const validationResult = validateBody(sendMessageSchema)(sanitizedBody);
    if (validationResult instanceof NextResponse) {
      return addSecurityHeaders(validationResult);
    }

    const { user } = authResult;
    const { to, content, type = 'text', metadata } = validationResult;

    // Log request
    logRequest(request, user.id);

    // Check if user has WhatsApp connected
    const session = await jsonDb.getWhatsAppSession(user.id);
    if (!session || session.status !== 'connected') {
      return addSecurityHeaders(
        errorResponse('WHATSAPP_NOT_CONNECTED', 'WhatsApp is not connected. Please connect your WhatsApp first.', 400)
      );
    }

    // Send message via WhatsApp service
    const message = await whatsappService.sendMessage(user.id, to, content, type, metadata);

    const response = successResponse(message, {
      processingTime: Date.now() - startTime
    });

    return addSecurityHeaders(response);
  } catch (error: any) {
    console.error('Error in POST /api/cms/whatsapp/send:', error);
    return addSecurityHeaders(
      errorResponse('WHATSAPP_SEND_ERROR', error.message || 'Failed to send WhatsApp message', 500, {
        processingTime: Date.now() - startTime
      })
    );
  }
}