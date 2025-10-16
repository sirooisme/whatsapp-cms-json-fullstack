// Core data types for the WhatsApp CMS system

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'agent';
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
  phone?: string;
  whatsappConnected?: boolean;
  whatsappSessionId?: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  tags: string[];
  notes?: string;
  assignedAgentId?: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  isActive: boolean;
  customFields?: Record<string, any>;
}

export interface Message {
  id: string;
  chatId: string;
  contactId: string;
  agentId?: string;
  content: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'system';
  direction: 'inbound' | 'outbound';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  externalId?: string; // WhatsApp message ID
  metadata?: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    thumbnailUrl?: string;
    mediaUrl?: string;
  };
  isEdited: boolean;
  editedAt?: string;
  replyToId?: string;
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  emoji: string;
  userId: string;
  timestamp: string;
}

export interface Chat {
  id: string;
  contactId: string;
  assignedAgentId?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  status: 'active' | 'archived' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: {
    source?: string;
    campaign?: string;
    assignedAt?: string;
    resolvedAt?: string;
  };
}

export interface WhatsAppSession {
  id: string;
  agentId: string;
  phone: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'qr_required' | 'error';
  qrCode?: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    deviceName?: string;
    deviceModel?: string;
    whatsappVersion?: string;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface DatabaseStats {
  totalUsers: number;
  totalContacts: number;
  totalChats: number;
  totalMessages: number;
  activeChats: number;
  connectedAgents: number;
}