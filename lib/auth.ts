import { betterAuth } from "better-auth";
import { jsonDb } from "./json-db";

// In-memory session store for development
// In production, use Redis or external session store
const sessionStore = new Map<string, any>();

// Custom session management
export const sessionManager = {
  create: async (userId: string, data: any) => {
    const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const session = {
      id: sessionId,
      userId,
      data,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    };
    sessionStore.set(sessionId, session);
    return session;
  },
  get: async (sessionId: string) => {
    const session = sessionStore.get(sessionId);
    if (!session) return null;
    
    // Check if session is expired
    if (new Date(session.expiresAt) < new Date()) {
      sessionStore.delete(sessionId);
      return null;
    }
    
    return session;
  },
  update: async (sessionId: string, data: any) => {
    const session = sessionStore.get(sessionId);
    if (session) {
      session.data = data;
      sessionStore.set(sessionId, session);
    }
    return session;
  },
  delete: async (sessionId: string) => {
    sessionStore.delete(sessionId);
  }
};

export const auth = betterAuth({
  database: {
    // We'll handle user management through our API routes
    // This is a simplified setup for development
    create: async (data: any) => {
      try {
        const user = await jsonDb.createUser({
          email: data.email,
          name: data.name,
          role: data.role || 'agent',
          isActive: true
        });
        return { ...user, id: user.id };
      } catch (error) {
        throw new Error('Failed to create user');
      }
    },
    findById: async (id: string) => {
      try {
        const user = await jsonDb.getUserById(id);
        return user ? { ...user, id: user.id } : null;
      } catch (error) {
        return null;
      }
    },
    findByEmail: async (email: string) => {
      try {
        const user = await jsonDb.getUserByEmail(email);
        return user ? { ...user, id: user.id } : null;
      } catch (error) {
        return null;
      }
    }
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60 // 5 minutes
    }
  },
  account: {
    accountLinking: {
      enabled: false
    }
  }
});