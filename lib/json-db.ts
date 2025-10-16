import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { User, Contact, Chat, Message, WhatsAppSession, DatabaseStats } from './types';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const rename = promisify(fs.rename);
const exists = promisify(fs.exists);

// File locking mechanism
interface LockFile {
  pid: number;
  timestamp: number;
  operation: string;
}

class JsonDatabase {
  private dataDir: string;
  private lockDir: string;
  private lockTimeout: number = 30000; // 30 seconds
  private retryInterval: number = 100; // 100ms
  private maxRetries: number = 300; // 30 seconds max

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.lockDir = path.join(this.dataDir, 'locks');
    this.ensureDataDirectory();
  }

  private async ensureDataDirectory(): Promise<void> {
    try {
      await mkdir(this.dataDir, { recursive: true });
      await mkdir(this.lockDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create data directories:', error);
      throw error;
    }
  }

  private getFilePath(collection: string): string {
    return path.join(this.dataDir, `${collection}.json`);
  }

  private getLockPath(collection: string): string {
    return path.join(this.lockDir, `${collection}.lock`);
  }

  private async acquireLock(collection: string, operation: string): Promise<void> {
    const lockPath = this.getLockPath(collection);
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.lockTimeout) {
      try {
        // Check if lock exists and is valid
        if (fs.existsSync(lockPath)) {
          const lockData = JSON.parse(await readFile(lockPath, 'utf-8')) as LockFile;
          
          // Check if lock is stale (older than timeout)
          if (Date.now() - lockData.timestamp > this.lockTimeout) {
            // Remove stale lock
            fs.unlinkSync(lockPath);
          } else {
            // Lock is still valid, wait
            await new Promise(resolve => setTimeout(resolve, this.retryInterval));
            continue;
          }
        }

        // Create new lock
        const lockData: LockFile = {
          pid: process.pid,
          timestamp: Date.now(),
          operation
        };
        
        await writeFile(lockPath, JSON.stringify(lockData, null, 2));
        return;
      } catch (error) {
        // Lock creation failed, wait and retry
        await new Promise(resolve => setTimeout(resolve, this.retryInterval));
      }
    }
    
    throw new Error(`Failed to acquire lock for ${collection} after ${this.lockTimeout}ms`);
  }

  private async releaseLock(collection: string): Promise<void> {
    const lockPath = this.getLockPath(collection);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch (error) {
      console.error(`Failed to release lock for ${collection}:`, error);
    }
  }

  private async readJsonFile<T>(collection: string): Promise<T[]> {
    const filePath = this.getFilePath(collection);
    
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    try {
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data) as T[];
    } catch (error) {
      console.error(`Error reading ${collection} file:`, error);
      throw new Error(`Failed to read ${collection} data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async writeJsonFile<T>(collection: string, data: T[]): Promise<void> {
    const filePath = this.getFilePath(collection);
    const tempFilePath = `${filePath}.tmp`;
    
    try {
      // Write to temporary file first
      await writeFile(tempFilePath, JSON.stringify(data, null, 2));
      
      // Atomic rename operation
      await rename(tempFilePath, filePath);
    } catch (error) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw new Error(`Failed to write ${collection} data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async withLock<T>(collection: string, operation: string, fn: () => Promise<T>): Promise<T> {
    await this.acquireLock(collection, operation);
    try {
      return await fn();
    } finally {
      await this.releaseLock(collection);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  // User operations
  async getUsers(): Promise<User[]> {
    return this.withLock('users', 'read', () => this.readJsonFile<User>('users'));
  }

  async getUserById(id: string): Promise<User | null> {
    const users = await this.getUsers();
    return users.find(user => user.id === id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const users = await this.getUsers();
    return users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    return this.withLock('users', 'write', async () => {
      const users = await this.getUsers();
      
      // Check if email already exists
      if (users.some(user => user.email.toLowerCase() === userData.email.toLowerCase())) {
        throw new Error('User with this email already exists');
      }
      
      const newUser: User = {
        id: this.generateId(),
        ...userData,
        createdAt: this.getCurrentTimestamp(),
        updatedAt: this.getCurrentTimestamp()
      };
      
      users.push(newUser);
      await this.writeJsonFile('users', users);
      
      return newUser;
    });
  }

  async updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    return this.withLock('users', 'write', async () => {
      const users = await this.getUsers();
      const userIndex = users.findIndex(user => user.id === id);
      
      if (userIndex === -1) {
        throw new Error('User not found');
      }
      
      users[userIndex] = {
        ...users[userIndex],
        ...updates,
        updatedAt: this.getCurrentTimestamp()
      };
      
      await this.writeJsonFile('users', users);
      return users[userIndex];
    });
  }

  async deleteUser(id: string): Promise<void> {
    return this.withLock('users', 'write', async () => {
      const users = await this.getUsers();
      const filteredUsers = users.filter(user => user.id !== id);
      
      if (filteredUsers.length === users.length) {
        throw new Error('User not found');
      }
      
      await this.writeJsonFile('users', filteredUsers);
    });
  }

  // Contact operations
  async getContacts(): Promise<Contact[]> {
    return this.withLock('contacts', 'read', () => this.readJsonFile<Contact>('contacts'));
  }

  async getContactsByAgent(agentId: string): Promise<Contact[]> {
    const contacts = await this.getContacts();
    return contacts.filter(contact => contact.assignedAgentId === agentId);
  }

  async createContact(contactData: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contact> {
    return this.withLock('contacts', 'write', async () => {
      const contacts = await this.getContacts();
      
      // Check if phone already exists
      if (contacts.some(contact => contact.phone === contactData.phone)) {
        throw new Error('Contact with this phone number already exists');
      }
      
      const newContact: Contact = {
        id: this.generateId(),
        ...contactData,
        createdAt: this.getCurrentTimestamp(),
        updatedAt: this.getCurrentTimestamp()
      };
      
      contacts.push(newContact);
      await this.writeJsonFile('contacts', contacts);
      
      return newContact;
    });
  }

  async updateContact(id: string, updates: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<Contact> {
    return this.withLock('contacts', 'write', async () => {
      const contacts = await this.getContacts();
      const contactIndex = contacts.findIndex(contact => contact.id === id);
      
      if (contactIndex === -1) {
        throw new Error('Contact not found');
      }
      
      contacts[contactIndex] = {
        ...contacts[contactIndex],
        ...updates,
        updatedAt: this.getCurrentTimestamp()
      };
      
      await this.writeJsonFile('contacts', contacts);
      return contacts[contactIndex];
    });
  }

  async deleteContact(id: string): Promise<void> {
    return this.withLock('contacts', 'write', async () => {
      const contacts = await this.getContacts();
      const filteredContacts = contacts.filter(contact => contact.id !== id);
      
      if (filteredContacts.length === contacts.length) {
        throw new Error('Contact not found');
      }
      
      await this.writeJsonFile('contacts', filteredContacts);
    });
  }

  // Chat operations
  async getChats(agentId?: string): Promise<Chat[]> {
    const chats = await this.withLock('chats', 'read', () => this.readJsonFile<Chat>('chats'));
    
    if (agentId) {
      return chats.filter(chat => chat.assignedAgentId === agentId);
    }
    
    return chats;
  }

  async getChatById(id: string): Promise<Chat | null> {
    const chats = await this.getChats();
    return chats.find(chat => chat.id === id) || null;
  }

  async createChat(chatData: Omit<Chat, 'id' | 'createdAt' | 'updatedAt'>): Promise<Chat> {
    return this.withLock('chats', 'write', async () => {
      const chats = await this.getChats();
      
      const newChat: Chat = {
        id: this.generateId(),
        ...chatData,
        createdAt: this.getCurrentTimestamp(),
        updatedAt: this.getCurrentTimestamp()
      };
      
      chats.push(newChat);
      await this.writeJsonFile('chats', chats);
      
      return newChat;
    });
  }

  async updateChat(id: string, updates: Partial<Omit<Chat, 'id' | 'createdAt'>>): Promise<Chat> {
    return this.withLock('chats', 'write', async () => {
      const chats = await this.getChats();
      const chatIndex = chats.findIndex(chat => chat.id === id);
      
      if (chatIndex === -1) {
        throw new Error('Chat not found');
      }
      
      chats[chatIndex] = {
        ...chats[chatIndex],
        ...updates,
        updatedAt: this.getCurrentTimestamp()
      };
      
      await this.writeJsonFile('chats', chats);
      return chats[chatIndex];
    });
  }

  // Message operations
  async getMessages(chatId: string, limit?: number, offset?: number): Promise<Message[]> {
    const messages = await this.withLock('messages', 'read', () => this.readJsonFile<Message>('messages'));
    
    let chatMessages = messages
      .filter(message => message.chatId === chatId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    if (offset) {
      chatMessages = chatMessages.slice(offset);
    }
    
    if (limit) {
      chatMessages = chatMessages.slice(0, limit);
    }
    
    return chatMessages;
  }

  async saveMessage(messageData: Omit<Message, 'id'>): Promise<Message> {
    return this.withLock('messages', 'write', async () => {
      const messages = await this.readJsonFile<Message>('messages');
      
      const newMessage: Message = {
        id: this.generateId(),
        ...messageData
      };
      
      messages.push(newMessage);
      await this.writeJsonFile('messages', messages);
      
      // Update chat's last message info
      await this.updateChat(messageData.chatId, {
        lastMessageAt: messageData.timestamp,
        lastMessagePreview: messageData.content.substring(0, 100),
        updatedAt: this.getCurrentTimestamp()
      });
      
      return newMessage;
    });
  }

  async updateMessage(id: string, updates: Partial<Omit<Message, 'id'>>): Promise<Message> {
    return this.withLock('messages', 'write', async () => {
      const messages = await this.readJsonFile<Message>('messages');
      const messageIndex = messages.findIndex(message => message.id === id);
      
      if (messageIndex === -1) {
        throw new Error('Message not found');
      }
      
      messages[messageIndex] = {
        ...messages[messageIndex],
        ...updates
      };
      
      await this.writeJsonFile('messages', messages);
      return messages[messageIndex];
    });
  }

  // WhatsApp Session operations
  async getWhatsAppSession(agentId: string): Promise<WhatsAppSession | null> {
    const sessions = await this.withLock('sessions', 'read', () => this.readJsonFile<WhatsAppSession>('sessions'));
    return sessions.find(session => session.agentId === agentId) || null;
  }

  async createWhatsAppSession(sessionData: Omit<WhatsAppSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<WhatsAppSession> {
    return this.withLock('sessions', 'write', async () => {
      const sessions = await this.readJsonFile<WhatsAppSession>('sessions');
      
      // Remove any existing session for this agent
      const filteredSessions = sessions.filter(session => session.agentId !== sessionData.agentId);
      
      const newSession: WhatsAppSession = {
        id: this.generateId(),
        ...sessionData,
        createdAt: this.getCurrentTimestamp(),
        updatedAt: this.getCurrentTimestamp()
      };
      
      filteredSessions.push(newSession);
      await this.writeJsonFile('sessions', filteredSessions);
      
      return newSession;
    });
  }

  async updateWhatsAppSession(agentId: string, updates: Partial<Omit<WhatsAppSession, 'id' | 'createdAt'>>): Promise<WhatsAppSession> {
    return this.withLock('sessions', 'write', async () => {
      const sessions = await this.readJsonFile<WhatsAppSession>('sessions');
      const sessionIndex = sessions.findIndex(session => session.agentId === agentId);
      
      if (sessionIndex === -1) {
        throw new Error('WhatsApp session not found');
      }
      
      sessions[sessionIndex] = {
        ...sessions[sessionIndex],
        ...updates,
        updatedAt: this.getCurrentTimestamp()
      };
      
      await this.writeJsonFile('sessions', sessions);
      return sessions[sessionIndex];
    });
  }

  async deleteWhatsAppSession(agentId: string): Promise<void> {
    return this.withLock('sessions', 'write', async () => {
      const sessions = await this.readJsonFile<WhatsAppSession>('sessions');
      const filteredSessions = sessions.filter(session => session.agentId !== agentId);
      await this.writeJsonFile('sessions', filteredSessions);
    });
  }

  // Database statistics
  async getStats(): Promise<DatabaseStats> {
    const [users, contacts, chats, messages, sessions] = await Promise.all([
      this.getUsers(),
      this.getContacts(),
      this.getChats(),
      this.withLock('messages', 'read', () => this.readJsonFile<Message>('messages')),
      this.withLock('sessions', 'read', () => this.readJsonFile<WhatsAppSession>('sessions'))
    ]);

    return {
      totalUsers: users.length,
      totalContacts: contacts.length,
      totalChats: chats.length,
      totalMessages: messages.length,
      activeChats: chats.filter(chat => chat.status === 'active').length,
      connectedAgents: sessions.filter(session => session.status === 'connected').length
    };
  }

  // Database backup and restore
  async backup(backupPath: string): Promise<void> {
    const collections = ['users', 'contacts', 'chats', 'messages', 'sessions'];
    const backup: Record<string, any> = {};
    
    for (const collection of collections) {
      backup[collection] = await this.withLock(collection, 'read', () => this.readJsonFile<any>(collection));
    }
    
    await writeFile(backupPath, JSON.stringify(backup, null, 2));
  }

  async restore(backupPath: string): Promise<void> {
    const backupData = JSON.parse(await readFile(backupPath, 'utf-8'));
    
    for (const [collection, data] of Object.entries(backupData)) {
      await this.withLock(collection, 'restore', async () => {
        await this.writeJsonFile(collection, data as any[]);
      });
    }
  }
}

// Singleton instance
export const jsonDb = new JsonDatabase();
export default jsonDb;