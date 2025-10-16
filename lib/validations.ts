import { z } from 'zod';

// Common validation schemas
const emailSchema = z.string().email('Invalid email address');
const phoneSchema = z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number');
const idSchema = z.string().min(1, 'ID is required');
const timestampSchema = z.string().datetime('Invalid timestamp');

// User validation schemas
export const userRoleSchema = z.enum(['admin', 'agent']);

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  role: userRoleSchema,
  avatar: z.string().url('Invalid avatar URL').optional(),
  phone: phoneSchema.optional(),
  isActive: z.boolean().default(true)
});

export const updateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  role: userRoleSchema.optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  phone: phoneSchema.optional(),
  isActive: z.boolean().optional(),
  lastLoginAt: timestampSchema.optional(),
  whatsappConnected: z.boolean().optional(),
  whatsappSessionId: z.string().optional()
});

// Contact validation schemas
export const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  phone: phoneSchema,
  email: emailSchema.optional(),
  company: z.string().max(100, 'Company name too long').optional(),
  tags: z.array(z.string().max(50, 'Tag too long')).max(20, 'Too many tags').default([]),
  notes: z.string().max(1000, 'Notes too long').optional(),
  assignedAgentId: idSchema.optional(),
  isActive: z.boolean().default(true),
  customFields: z.record(z.any()).optional()
});

export const updateContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  company: z.string().max(100, 'Company name too long').optional(),
  tags: z.array(z.string().max(50, 'Tag too long')).max(20, 'Too many tags').optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  assignedAgentId: idSchema.optional(),
  isActive: z.boolean().optional(),
  lastMessageAt: timestampSchema.optional(),
  customFields: z.record(z.any()).optional()
});

// Chat validation schemas
export const chatStatusSchema = z.enum(['active', 'archived', 'closed']);
export const chatPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const createChatSchema = z.object({
  contactId: idSchema,
  assignedAgentId: idSchema.optional(),
  status: chatStatusSchema.default('active'),
  priority: chatPrioritySchema.default('medium'),
  tags: z.array(z.string().max(50, 'Tag too long')).max(10, 'Too many tags').default([]),
  metadata: z.record(z.any()).optional()
});

export const updateChatSchema = z.object({
  assignedAgentId: idSchema.optional(),
  status: chatStatusSchema.optional(),
  priority: chatPrioritySchema.optional(),
  tags: z.array(z.string().max(50, 'Tag too long')).max(10, 'Too many tags').optional(),
  unreadCount: z.number().int().min(0, 'Unread count must be non-negative').optional(),
  metadata: z.record(z.any()).optional()
});

// Message validation schemas
export const messageTypeSchema = z.enum(['text', 'image', 'document', 'audio', 'video', 'system']);
export const messageDirectionSchema = z.enum(['inbound', 'outbound']);
export const messageStatusSchema = z.enum(['pending', 'sent', 'delivered', 'read', 'failed']);

export const createMessageSchema = z.object({
  chatId: idSchema,
  contactId: idSchema,
  agentId: idSchema.optional(),
  content: z.string().min(1, 'Message content is required').max(4000, 'Message too long'),
  type: messageTypeSchema.default('text'),
  direction: messageDirectionSchema,
  status: messageStatusSchema.default('pending'),
  externalId: z.string().optional(),
  metadata: z.object({
    fileName: z.string().optional(),
    fileSize: z.number().int().positive('File size must be positive').optional(),
    mimeType: z.string().optional(),
    thumbnailUrl: z.string().url('Invalid thumbnail URL').optional(),
    mediaUrl: z.string().url('Invalid media URL').optional()
  }).optional(),
  replyToId: idSchema.optional()
});

export const updateMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(4000, 'Message too long').optional(),
  status: messageStatusSchema.optional(),
  isEdited: z.boolean().optional(),
  editedAt: timestampSchema.optional(),
  externalId: z.string().optional(),
  metadata: z.object({
    fileName: z.string().optional(),
    fileSize: z.number().int().positive('File size must be positive').optional(),
    mimeType: z.string().optional(),
    thumbnailUrl: z.string().url('Invalid thumbnail URL').optional(),
    mediaUrl: z.string().url('Invalid media URL').optional()
  }).optional()
});

// WhatsApp session validation schemas
export const whatsappStatusSchema = z.enum(['connecting', 'connected', 'disconnected', 'qr_required', 'error']);

export const createWhatsAppSessionSchema = z.object({
  agentId: idSchema,
  phone: phoneSchema,
  status: whatsappStatusSchema.default('connecting'),
  qrCode: z.string().optional(),
  metadata: z.object({
    deviceName: z.string().optional(),
    deviceModel: z.string().optional(),
    whatsappVersion: z.string().optional()
  }).optional()
});

export const updateWhatsAppSessionSchema = z.object({
  status: whatsappStatusSchema.optional(),
  qrCode: z.string().optional(),
  lastActivityAt: timestampSchema.optional(),
  metadata: z.object({
    deviceName: z.string().optional(),
    deviceModel: z.string().optional(),
    whatsappVersion: z.string().optional()
  }).optional()
});

// API query parameter schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive('Page must be positive').default(1),
  limit: z.coerce.number().int().positive('Limit must be positive').max(100, 'Limit cannot exceed 100').default(20)
});

export const messageQuerySchema = paginationSchema.extend({
  chatId: idSchema.optional(),
  contactId: idSchema.optional(),
  agentId: idSchema.optional(),
  type: messageTypeSchema.optional(),
  direction: messageDirectionSchema.optional(),
  status: messageStatusSchema.optional(),
  startDate: timestampSchema.optional(),
  endDate: timestampSchema.optional()
});

export const contactQuerySchema = paginationSchema.extend({
  assignedAgentId: idSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().max(100, 'Search term too long').optional()
});

export const chatQuerySchema = paginationSchema.extend({
  assignedAgentId: idSchema.optional(),
  contactId: idSchema.optional(),
  status: chatStatusSchema.optional(),
  priority: chatPrioritySchema.optional(),
  tags: z.array(z.string()).optional(),
  hasUnread: z.coerce.boolean().optional()
});

// WhatsApp send message schema
export const sendMessageSchema = z.object({
  to: phoneSchema,
  content: z.string().min(1, 'Message content is required').max(4000, 'Message too long'),
  type: messageTypeSchema.default('text'),
  metadata: z.object({
    fileName: z.string().optional(),
    fileSize: z.number().int().positive('File size must be positive').optional(),
    mimeType: z.string().optional(),
    mediaUrl: z.string().url('Invalid media URL').optional()
  }).optional()
});

// Authentication schemas
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const signUpSchema = signInSchema.extend({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  role: userRoleSchema.default('agent')
});

// Response schemas
export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional()
  }).optional(),
  timestamp: timestampSchema
});

// Export type inference
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type CreateChatInput = z.infer<typeof createChatSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type CreateWhatsAppSessionInput = z.infer<typeof createWhatsAppSessionSchema>;
export type UpdateWhatsAppSessionInput = z.infer<typeof updateWhatsAppSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type MessageQueryInput = z.infer<typeof messageQuerySchema>;
export type ContactQueryInput = z.infer<typeof contactQuerySchema>;
export type ChatQueryInput = z.infer<typeof chatQuerySchema>;