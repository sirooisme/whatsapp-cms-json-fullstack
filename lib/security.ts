import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import CryptoJS from 'crypto-js';

export class SecurityService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
  private static readonly ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  private static readonly SALT_ROUNDS = 12;
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  // Rate limiting store (in production, use Redis)
  private static rateLimitStore = new Map<string, { attempts: number; resetTime: number; lockoutUntil?: number }>();

  // Password hashing and verification
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // JWT token management
  static generateToken(payload: any, expiresIn: string = '7d'): string {
    return jwt.sign(payload, this.JWT_SECRET, { expiresIn });
  }

  static verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  // Data encryption for sensitive data
  static encrypt(text: string): string {
    const encrypted = CryptoJS.AES.encrypt(text, this.ENCRYPTION_KEY).toString();
    return encrypted;
  }

  static decrypt(encryptedText: string): string {
    const decrypted = CryptoJS.AES.decrypt(encryptedText, this.ENCRYPTION_KEY);
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  // Generate secure random tokens
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // Input sanitization and validation
  static sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .replace(/data:/gi, '') // Remove data: protocol
        .replace(/vbscript:/gi, '') // Remove vbscript: protocol
        .trim();
    }

    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item));
    }

    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        const sanitizedKey = this.sanitizeInput(key);
        sanitized[sanitizedKey] = this.sanitizeInput(value);
      }
      return sanitized;
    }

    return input;
  }

  // Email validation
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  // Phone number validation
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  // File validation
  static isValidFileType(filename: string, allowedTypes: string[]): boolean {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? allowedTypes.includes(extension) : false;
  }

  static isValidFileSize(size: number, maxSize: number = 10 * 1024 * 1024): boolean {
    return size <= maxSize;
  }

  // Rate limiting
  static checkRateLimit(identifier: string, maxAttempts: number = 100, windowMs: number = 60 * 1000): { allowed: boolean; remainingAttempts: number; resetTime: number } {
    const now = Date.now();
    const record = this.rateLimitStore.get(identifier);

    if (!record || now > record.resetTime) {
      // New window
      const newRecord = {
        attempts: 1,
        resetTime: now + windowMs
      };
      this.rateLimitStore.set(identifier, newRecord);
      return { allowed: true, remainingAttempts: maxAttempts - 1, resetTime: newRecord.resetTime };
    }

    if (record.lockoutUntil && now < record.lockoutUntil) {
      return { 
        allowed: false, 
        remainingAttempts: 0, 
        resetTime: record.lockoutUntil 
      };
    }

    if (record.attempts >= maxAttempts) {
      // Apply lockout
      record.lockoutUntil = now + this.LOCKOUT_DURATION;
      this.rateLimitStore.set(identifier, record);
      return { 
        allowed: false, 
        remainingAttempts: 0, 
        resetTime: record.lockoutUntil 
      };
    }

    record.attempts++;
    this.rateLimitStore.set(identifier, record);
    return { 
      allowed: true, 
      remainingAttempts: maxAttempts - record.attempts, 
      resetTime: record.resetTime 
    };
  }

  // Brute force protection for login attempts
  static checkLoginAttempts(identifier: string): { allowed: boolean; remainingAttempts: number; lockoutUntil?: number } {
    const record = this.rateLimitStore.get(`login:${identifier}`);
    
    if (!record) {
      return { allowed: true, remainingAttempts: this.MAX_LOGIN_ATTEMPTS - 1 };
    }

    const now = Date.now();
    
    if (record.lockoutUntil && now < record.lockoutUntil) {
      return { 
        allowed: false, 
        remainingAttempts: 0, 
        lockoutUntil: record.lockoutUntil 
      };
    }

    if (record.attempts >= this.MAX_LOGIN_ATTEMPTS) {
      const lockoutUntil = now + this.LOCKOUT_DURATION;
      record.lockoutUntil = lockoutUntil;
      this.rateLimitStore.set(`login:${identifier}`, record);
      return { 
        allowed: false, 
        remainingAttempts: 0, 
        lockoutUntil 
      };
    }

    return { 
      allowed: true, 
      remainingAttempts: this.MAX_LOGIN_ATTEMPTS - record.attempts 
    };
  }

  static recordFailedLogin(identifier: string): void {
    const key = `login:${identifier}`;
    const record = this.rateLimitStore.get(key) || { attempts: 0, resetTime: Date.now() + this.LOCKOUT_DURATION };
    record.attempts++;
    this.rateLimitStore.set(key, record);
  }

  static recordSuccessfulLogin(identifier: string): void {
    this.rateLimitStore.delete(`login:${identifier}`);
  }

  // CSRF protection
  static generateCSRFToken(): string {
    return this.generateSecureToken(32);
  }

  static validateCSRFToken(token: string, sessionToken: string): boolean {
    // In a real implementation, you'd store CSRF tokens in the user's session
    return token && sessionToken && token.length === 64; // Basic validation
  }

  // Content Security Policy headers
  static getCSPHeaders(): Record<string, string> {
    return {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self'",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; '),
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
    };
  }

  // Security monitoring and logging
  static logSecurityEvent(event: string, details: any, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      severity,
      details,
      ip: details.ip || 'unknown',
      userAgent: details.userAgent || 'unknown'
    };

    console.warn('[SECURITY]', JSON.stringify(logEntry));

    // In production, you'd send this to a security monitoring service
    if (severity === 'high' || severity === 'critical') {
      // Trigger immediate alert
      console.error('[CRITICAL SECURITY EVENT]', logEntry);
    }
  }

  // Input validation for SQL injection prevention
  static detectSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
      /(--)|(\/\*)|(\*\/)/,
      /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
      /(\bOR\b|\bAND\b)\s+['"].*['"]\s*=\s*['"].*['"]/i,
      /\bUNION\b.*\bSELECT\b/i,
      /\bEXEC\b.*\bXP_/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  // XSS detection
  static detectXSS(input: string): boolean {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>/gi,
      /<object[^>]*>/gi,
      /<embed[^>]*>/gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  // Path traversal detection
  static detectPathTraversal(input: string): boolean {
    const pathTraversalPatterns = [
      /\.\.\//,
      /\.\.\\/,
      /\.\.\/\.\.\//,
      /%2e%2e%2f/,
      /%2e%2e\\/i,
      /\.\.%2f/,
      /\.\.%5c/
    ];

    return pathTraversalPatterns.some(pattern => pattern.test(input));
  }

  // Validate file upload paths
  static validateFilePath(filePath: string): boolean {
    // Normalize path and check for dangerous patterns
    const normalized = filePath.replace(/\\/g, '/');
    
    // Check for path traversal
    if (this.detectPathTraversal(normalized)) {
      return false;
    }

    // Check if path starts with allowed directories
    const allowedPaths = ['/uploads/', '/data/', '/sessions/'];
    return allowedPaths.some(allowedPath => normalized.startsWith(allowedPath));
  }

  // Generate secure session ID
  static generateSessionId(): string {
    return this.generateSecureToken(64);
  }

  // Validate session ID format
  static isValidSessionId(sessionId: string): boolean {
    return /^[a-f0-9]{128}$/.test(sessionId);
  }

  // API key validation
  static generateApiKey(): { key: string; hash: string } {
    const key = `whatsapp_cms_${this.generateSecureToken(48)}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return { key, hash };
  }

  static validateApiKey(key: string, hash: string): boolean {
    const computedHash = crypto.createHash('sha256').update(key).digest('hex');
    return computedHash === hash;
  }

  // Clean up expired rate limit records
  static cleanupExpiredRecords(): void {
    const now = Date.now();
    for (const [key, record] of this.rateLimitStore.entries()) {
      if (now > record.resetTime && (!record.lockoutUntil || now > record.lockoutUntil)) {
        this.rateLimitStore.delete(key);
      }
    }
  }
}

// Auto-cleanup every 5 minutes
setInterval(() => {
  SecurityService.cleanupExpiredRecords();
}, 5 * 60 * 1000);

export default SecurityService;