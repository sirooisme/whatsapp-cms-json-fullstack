import makeWASocket, { 
  ConnectionState, 
  DisconnectReason, 
  Contact as BaileysContact,
  MessageUpsertType,
  WASocket,
  Chat,
  MessageUserReceiptUpdate,
  MessageRelayType
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { jsonDb } from './json-db';
import { Message, Contact, WhatsAppSession } from './types';
import { sendMessageSchema } from './validations';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const exists = promisify(fs.exists);

interface WhatsAppClient {
  socket: WASocket;
  agentId: string;
  phone: string;
  connectionState: ConnectionState;
  qrCode?: string;
  lastActivity: Date;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  isConnecting: boolean;
}

class WhatsAppService {
  private clients: Map<string, WhatsAppClient> = new Map();
  private sessionDir: string;
  private messageHandlers: Map<string, ((message: Message) => void)[]> = new Map();
  private connectionHandlers: Map<string, ((status: string, qrCode?: string) => void)[]> = new Map();
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000; // 5 seconds

  constructor() {
    this.sessionDir = path.join(process.cwd(), 'sessions');
    this.ensureSessionDirectory();
    this.initializeActiveSessions();
  }

  private async ensureSessionDirectory(): Promise<void> {
    try {
      const exists = await fs.promises.access(this.sessionDir).then(() => true).catch(() => false);
      if (!exists) {
        await fs.promises.mkdir(this.sessionDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create session directory:', error);
    }
  }

  private getSessionPath(agentId: string): string {
    return path.join(this.sessionDir, `session-${agentId}.json`);
  }

  private async saveSessionState(agentId: string, state: any): Promise<void> {
    try {
      const sessionPath = this.getSessionPath(agentId);
      await writeFile(sessionPath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error(`Failed to save session state for agent ${agentId}:`, error);
    }
  }

  private async loadSessionState(agentId: string): Promise<any> {
    try {
      const sessionPath = this.getSessionPath(agentId);
      if (fs.existsSync(sessionPath)) {
        const data = await fs.promises.readFile(sessionPath, 'utf-8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error(`Failed to load session state for agent ${agentId}:`, error);
      return null;
    }
  }

  private async deleteSessionState(agentId: string): Promise<void> {
    try {
      const sessionPath = this.getSessionPath(agentId);
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }
    } catch (error) {
      console.error(`Failed to delete session state for agent ${agentId}:`, error);
    }
  }

  private async initializeActiveSessions(): Promise<void> {
    try {
      const sessions = await jsonDb.withLock('sessions', 'read', () => 
        jsonDb.readJsonFile<WhatsAppSession>('sessions')
      );
      
      const activeSessions = sessions.filter(session => session.status === 'connected');
      
      for (const session of activeSessions) {
        try {
          await this.initializeClient(session.agentId, session.phone);
        } catch (error) {
          console.error(`Failed to initialize session for agent ${session.agentId}:`, error);
          // Mark session as disconnected in database
          await jsonDb.updateWhatsAppSession(session.agentId, {
            status: 'disconnected',
            lastActivityAt: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Failed to initialize active sessions:', error);
    }
  }

  private createClient(agentId: string, phone: string): WhatsAppClient {
    const client: WhatsAppClient = {
      socket: {} as WASocket,
      agentId,
      phone,
      connectionState: { connection: 'close' },
      lastActivity: new Date(),
      reconnectAttempts: 0,
      maxReconnectAttempts: this.maxReconnectAttempts,
      isConnecting: false
    };

    // Load saved session state if exists
    this.loadSessionState(agentId).then(savedState => {
      const { version, isLatest } = makeWASocket.defaults({
        auth: savedState,
        printQRInTerminal: false
      });

      client.socket = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: savedState,
        browser: ['WhatsApp CMS', 'Chrome', '4.0.0'],
        connectTimeoutMs: 60000,
        retryRequestDelayMs: 3000,
        maxMsgRetryDelay: 30000,
        qrTimeout: 60000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 30000,
        phoneNumber: phone
      });

      this.setupEventListeners(client);
    });

    return client;
  }

  private setupEventListeners(client: WhatsAppClient): void {
    // Connection events
    client.socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;
      
      client.connectionState = { ...client.connectionState, ...update };
      client.lastActivity = new Date();

      if (qr) {
        client.qrCode = qr;
        console.log(`QR Code received for agent ${client.agentId}:`, qr);
        qrcode.generate(qr, { small: true });
        
        // Update session in database
        await jsonDb.updateWhatsAppSession(client.agentId, {
          status: 'qr_required',
          qrCode: qr,
          lastActivityAt: new Date().toISOString()
        });

        // Notify connection handlers
        this.notifyConnectionHandlers(client.agentId, 'qr_required', qr);
      }

      if (connection === 'open') {
        console.log(`WhatsApp connected for agent ${client.agentId}`);
        client.reconnectAttempts = 0;
        client.isConnecting = false;

        // Save session state
        const authState = client.socket.authState();
        await this.saveSessionState(client.agentId, authState);

        // Update session in database
        await jsonDb.updateWhatsAppSession(client.agentId, {
          status: 'connected',
          qrCode: undefined,
          lastActivityAt: new Date().toISOString(),
          metadata: {
            deviceName: client.socket.user?.name || 'Unknown',
            deviceModel: 'WhatsApp Web',
            whatsappVersion: '2.0'
          }
        });

        // Notify connection handlers
        this.notifyConnectionHandlers(client.agentId, 'connected');

        // Sync contacts
        await this.syncContacts(client);
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`WhatsApp connection closed for agent ${client.agentId}, should reconnect: ${shouldReconnect}`);

        if (shouldReconnect && client.reconnectAttempts < client.maxReconnectAttempts) {
          client.reconnectAttempts++;
          client.isConnecting = true;
          
          console.log(`Attempting to reconnect for agent ${client.agentId} (attempt ${client.reconnectAttempts}/${client.maxReconnectAttempts})`);
          
          setTimeout(async () => {
            try {
              await this.initializeClient(client.agentId, client.phone);
            } catch (error) {
              console.error(`Reconnection failed for agent ${client.agentId}:`, error);
            }
          }, this.reconnectDelay * client.reconnectAttempts);
        } else {
          // Mark as disconnected
          await jsonDb.updateWhatsAppSession(client.agentId, {
            status: shouldReconnect ? 'error' : 'disconnected',
            lastActivityAt: new Date().toISOString()
          });

          // Delete session state if logged out
          if (!shouldReconnect) {
            await this.deleteSessionState(client.agentId);
          }

          // Notify connection handlers
          this.notifyConnectionHandlers(client.agentId, shouldReconnect ? 'error' : 'disconnected');
        }
      }
    });

    // Message events
    client.socket.ev.on('messages.upsert', async ({ messages, type }: { messages: any[], type: MessageUpsertType }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        if (!message.message) continue;

        try {
          const processedMessage = await this.processIncomingMessage(client.agentId, message);
          if (processedMessage) {
            // Save message to database
            await jsonDb.saveMessage(processedMessage);

            // Notify message handlers
            this.notifyMessageHandlers(client.agentId, processedMessage);
          }
        } catch (error) {
          console.error('Failed to process incoming message:', error);
        }
      }
    });

    // Message receipt updates
    client.socket.ev.on('message-receipt.update', async (updates: MessageUserReceiptUpdate[]) => {
      for (const update of updates) {
        try {
          await this.updateMessageReceipt(client.agentId, update);
        } catch (error) {
          console.error('Failed to update message receipt:', error);
        }
      }
    });

    // Credential updates
    client.socket.ev.on('creds.update', async () => {
      try {
        const authState = client.socket.authState();
        await this.saveSessionState(client.agentId, authState);
      } catch (error) {
        console.error('Failed to save credential update:', error);
      }
    });
  }

  private async processIncomingMessage(agentId: string, message: any): Promise<Message | null> {
    try {
      const messageContent = message.message;
      const messageType = Object.keys(messageContent)[0] as any;
      
      if (!messageType || messageType === 'protocolMessage') return null;

      const sender = message.key.remoteJid;
      const isGroup = sender.includes('@g.us');
      
      if (isGroup) return null; // Skip group messages for now

      // Find or create contact
      let contact = await this.findOrCreateContact(sender, agentId);
      
      // Find or create chat
      let chat = await this.findOrCreateChat(contact.id, agentId);

      let content = '';
      let type: Message['type'] = 'text';
      let metadata: any = {};

      switch (messageType) {
        case 'conversation':
          content = messageContent.conversation;
          break;
        case 'extendedTextMessage':
          content = messageContent.extendedTextMessage.text;
          break;
        case 'imageMessage':
          content = messageContent.imageMessage.caption || '📷 Image';
          type = 'image';
          metadata = {
            fileName: messageContent.imageMessage.fileName,
            fileSize: messageContent.imageMessage.fileLength,
            mimeType: messageContent.imageMessage.mimetype,
            thumbnailUrl: messageContent.imageMessage.jpegThumbnail
          };
          break;
        case 'documentMessage':
          content = messageContent.documentMessage.caption || '📄 Document';
          type = 'document';
          metadata = {
            fileName: messageContent.documentMessage.fileName,
            fileSize: messageContent.documentMessage.fileLength,
            mimeType: messageContent.documentMessage.mimetype
          };
          break;
        case 'audioMessage':
          content = '🎵 Audio';
          type = 'audio';
          metadata = {
            fileSize: messageContent.audioMessage.fileLength,
            mimeType: messageContent.audioMessage.mimetype
          };
          break;
        case 'videoMessage':
          content = messageContent.videoMessage.caption || '🎬 Video';
          type = 'video';
          metadata = {
            fileSize: messageContent.videoMessage.fileLength,
            mimeType: messageContent.videoMessage.mimetype,
            thumbnailUrl: messageContent.videoMessage.jpegThumbnail
          };
          break;
        default:
          content = `📩 ${messageType}`;
          type = 'system';
      }

      const processedMessage: Message = {
        id: message.key.id || this.generateMessageId(),
        chatId: chat.id,
        contactId: contact.id,
        agentId,
        content,
        type,
        direction: 'inbound',
        status: 'delivered',
        timestamp: new Date(message.messageTimestamp * 1000).toISOString(),
        externalId: message.key.id,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        isEdited: false
      };

      return processedMessage;
    } catch (error) {
      console.error('Failed to process incoming message:', error);
      return null;
    }
  }

  private async findOrCreateContact(phone: string, agentId: string): Promise<Contact> {
    try {
      const contacts = await jsonDb.getContacts();
      let contact = contacts.find(c => c.phone === phone);

      if (!contact) {
        // Create new contact
        contact = await jsonDb.createContact({
          name: phone, // Will be updated when contact syncs
          phone,
          assignedAgentId: agentId,
          tags: [],
          isActive: true
        });
      }

      return contact;
    } catch (error) {
      console.error('Failed to find or create contact:', error);
      throw error;
    }
  }

  private async findOrCreateChat(contactId: string, agentId: string): Promise<Chat> {
    try {
      const chats = await jsonDb.getChats(agentId);
      let chat = chats.find(c => c.contactId === contactId);

      if (!chat) {
        // Create new chat
        chat = await jsonDb.createChat({
          contactId,
          assignedAgentId: agentId,
          status: 'active',
          priority: 'medium',
          tags: [],
          unreadCount: 1
        });
      } else {
        // Update unread count
        await jsonDb.updateChat(chat.id, {
          unreadCount: chat.unreadCount + 1,
          updatedAt: new Date().toISOString()
        });
      }

      return chat;
    } catch (error) {
      console.error('Failed to find or create chat:', error);
      throw error;
    }
  }

  private async syncContacts(client: WhatsAppClient): Promise<void> {
    try {
      const contacts = await client.socket.store?.contacts || [];
      
      for (const [jid, baileysContact] of Object.entries(contacts)) {
        if (jid.includes('@s.whatsapp.net') && baileysContact?.name) {
          try {
            const existingContacts = await jsonDb.getContacts();
            const contact = existingContacts.find(c => c.phone === jid);
            
            if (contact && contact.name === contact.phone) {
              // Update contact name if it was previously just the phone number
              await jsonDb.updateContact(contact.id, {
                name: baileysContact.name || baileysContact.notify || contact.name
              });
            }
          } catch (error) {
            console.error('Failed to sync contact:', jid, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to sync contacts:', error);
    }
  }

  private async updateMessageReceipt(agentId: string, update: MessageUserReceiptUpdate): Promise<void> {
    try {
      const { key, receipt } = update;
      if (!key.id) return;

      const messages = await jsonDb.readJsonFile<Message>('messages');
      const message = messages.find(m => m.externalId === key.id);
      
      if (message) {
        let status: Message['status'] = 'delivered';
        
        if (receipt.receiptType === 2) { // Read
          status = 'read';
        } else if (receipt.receiptType === 1) { // Delivered
          status = 'delivered';
        }

        await jsonDb.updateMessage(message.id, { status });
      }
    } catch (error) {
      console.error('Failed to update message receipt:', error);
    }
  }

  private notifyMessageHandlers(agentId: string, message: Message): void {
    const handlers = this.messageHandlers.get(agentId) || [];
    handlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('Message handler error:', error);
      }
    });
  }

  private notifyConnectionHandlers(agentId: string, status: string, qrCode?: string): void {
    const handlers = this.connectionHandlers.get(agentId) || [];
    handlers.forEach(handler => {
      try {
        handler(status, qrCode);
      } catch (error) {
        console.error('Connection handler error:', error);
      }
    });
  }

  private generateMessageId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Public API methods
  async initializeClient(agentId: string, phone: string): Promise<void> {
    try {
      if (this.clients.has(agentId)) {
        throw new Error('Client already initialized for this agent');
      }

      const client = this.createClient(agentId, phone);
      this.clients.set(agentId, client);

      // Create or update session in database
      const existingSession = await jsonDb.getWhatsAppSession(agentId);
      
      if (existingSession) {
        await jsonDb.updateWhatsAppSession(agentId, {
          status: 'connecting',
          lastActivityAt: new Date().toISOString()
        });
      } else {
        await jsonDb.createWhatsAppSession({
          agentId,
          phone,
          status: 'connecting'
        });
      }
    } catch (error) {
      console.error(`Failed to initialize client for agent ${agentId}:`, error);
      throw error;
    }
  }

  async disconnectClient(agentId: string): Promise<void> {
    try {
      const client = this.clients.get(agentId);
      if (!client) {
        throw new Error('No client found for this agent');
      }

      client.socket.ev.removeAllListeners();
      client.socket.ws?.close();
      client.socket.logout();
      
      this.clients.delete(agentId);

      // Update session in database
      await jsonDb.updateWhatsAppSession(agentId, {
        status: 'disconnected',
        lastActivityAt: new Date().toISOString()
      });

      // Remove all handlers
      this.messageHandlers.delete(agentId);
      this.connectionHandlers.delete(agentId);
    } catch (error) {
      console.error(`Failed to disconnect client for agent ${agentId}:`, error);
      throw error;
    }
  }

  async sendMessage(agentId: string, to: string, content: string, type: Message['type'] = 'text', metadata?: any): Promise<Message> {
    try {
      const client = this.clients.get(agentId);
      if (!client || client.socket.user?.id) {
        throw new Error('WhatsApp client not connected');
      }

      // Validate input
      const validatedData = sendMessageSchema.parse({ to, content, type, metadata });

      let messagePayload: any = {};

      switch (type) {
        case 'text':
          messagePayload = { text: content };
          break;
        case 'image':
          if (metadata?.mediaUrl) {
            messagePayload = { 
              image: { url: metadata.mediaUrl },
              caption: content
            };
          } else {
            throw new Error('Media URL is required for image messages');
          }
          break;
        case 'document':
          if (metadata?.mediaUrl && metadata?.fileName) {
            messagePayload = {
              document: { url: metadata.mediaUrl },
              fileName: metadata.fileName,
              caption: content
            };
          } else {
            throw new Error('Media URL and file name are required for document messages');
          }
          break;
        default:
          throw new Error(`Message type ${type} not yet implemented`);
      }

      const result = await client.socket.sendMessage(validatedData.to, messagePayload);

      // Find or create contact and chat
      const contact = await this.findOrCreateContact(to, agentId);
      const chat = await this.findOrCreateChat(contact.id, agentId);

      // Save message to database
      const message: Message = {
        id: result.key.id || this.generateMessageId(),
        chatId: chat.id,
        contactId: contact.id,
        agentId,
        content,
        type,
        direction: 'outbound',
        status: 'sent',
        timestamp: new Date().toISOString(),
        externalId: result.key.id,
        metadata,
        isEdited: false
      };

      await jsonDb.saveMessage(message);

      // Update chat's last message
      await jsonDb.updateChat(chat.id, {
        lastMessageAt: message.timestamp,
        lastMessagePreview: content.substring(0, 100),
        updatedAt: new Date().toISOString()
      });

      return message;
    } catch (error) {
      console.error(`Failed to send message for agent ${agentId}:`, error);
      throw error;
    }
  }

  async getConnectionStatus(agentId: string): Promise<{ status: string, qrCode?: string, phone?: string }> {
    try {
      const client = this.clients.get(agentId);
      const session = await jsonDb.getWhatsAppSession(agentId);

      if (!client && !session) {
        return { status: 'disconnected' };
      }

      if (client) {
        const status = client.connectionState.connection || 'connecting';
        return {
          status: status === 'open' ? 'connected' : status,
          qrCode: client.qrCode,
          phone: client.phone
        };
      }

      return {
        status: session?.status || 'disconnected',
        phone: session?.phone
      };
    } catch (error) {
      console.error(`Failed to get connection status for agent ${agentId}:`, error);
      return { status: 'error' };
    }
  }

  onMessage(agentId: string, handler: (message: Message) => void): void {
    if (!this.messageHandlers.has(agentId)) {
      this.messageHandlers.set(agentId, []);
    }
    this.messageHandlers.get(agentId)!.push(handler);
  }

  onConnectionChange(agentId: string, handler: (status: string, qrCode?: string) => void): void {
    if (!this.connectionHandlers.has(agentId)) {
      this.connectionHandlers.set(agentId, []);
    }
    this.connectionHandlers.get(agentId)!.push(handler);
  }

  removeMessageHandler(agentId: string, handler: (message: Message) => void): void {
    const handlers = this.messageHandlers.get(agentId);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  removeConnectionHandler(agentId: string, handler: (status: string, qrCode?: string) => void): void {
    const handlers = this.connectionHandlers.get(agentId);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async getActiveConnections(): Promise<string[]> {
    try {
      const sessions = await jsonDb.withLock('sessions', 'read', () => 
        jsonDb.readJsonFile<WhatsAppSession>('sessions')
      );
      
      return sessions
        .filter(session => session.status === 'connected')
        .map(session => session.agentId);
    } catch (error) {
      console.error('Failed to get active connections:', error);
      return [];
    }
  }

  async getAllSessions(): Promise<WhatsAppSession[]> {
    try {
      return await jsonDb.withLock('sessions', 'read', () => 
        jsonDb.readJsonFile<WhatsAppSession>('sessions')
      );
    } catch (error) {
      console.error('Failed to get all sessions:', error);
      return [];
    }
  }
}

// Singleton instance
export const whatsappService = new WhatsAppService();
export default whatsappService;