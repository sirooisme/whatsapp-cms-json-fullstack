import fs from 'fs';
import path from 'path';
import { SecurityService } from './security';

interface SecurityEvent {
  id: string;
  timestamp: string;
  event: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  ip: string;
  userAgent: string;
  userId?: string;
  resolved: boolean;
}

interface SecurityMetrics {
  totalEvents: number;
  criticalEvents: number;
  highEvents: number;
  mediumEvents: number;
  lowEvents: number;
  eventsByType: Record<string, number>;
  eventsByIP: Record<string, number>;
  topThreats: Array<{
    type: string;
    count: number;
    severity: string;
  }>;
}

export class SecurityMonitor {
  private static logDir: string = path.join(process.cwd(), 'logs');
  private static securityLogFile: string = path.join(this.logDir, 'security.log');
  private static metricsFile: string = path.join(this.logDir, 'security-metrics.json');

  static {
    this.ensureLogDirectory();
  }

  private static ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  // Log security events
  static logEvent(
    event: string,
    details: any,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    ip?: string,
    userAgent?: string,
    userId?: string
  ): void {
    const securityEvent: SecurityEvent = {
      id: SecurityService.generateSecureToken(16),
      timestamp: new Date().toISOString(),
      event,
      severity,
      details: this.sanitizeLogData(details),
      ip: ip || 'unknown',
      userAgent: userAgent || 'unknown',
      userId,
      resolved: false
    };

    // Write to log file
    this.writeToLogFile(securityEvent);

    // Update metrics
    this.updateMetrics(securityEvent);

    // Trigger alerts for critical events
    if (severity === 'critical') {
      this.triggerAlert(securityEvent);
    }
  }

  private static sanitizeLogData(data: any): any {
    // Remove sensitive information from logs
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
    const sanitized = { ...data };

    const removeSensitive = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;

      if (Array.isArray(obj)) {
        return obj.map(removeSensitive);
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = removeSensitive(value);
        }
      }
      return result;
    };

    return removeSensitive(sanitized);
  }

  private static writeToLogFile(event: SecurityEvent): void {
    try {
      const logLine = JSON.stringify(event) + '\n';
      fs.appendFileSync(this.securityLogFile, logLine);
    } catch (error) {
      console.error('Failed to write security log:', error);
    }
  }

  private static updateMetrics(event: SecurityEvent): void {
    try {
      let metrics: SecurityMetrics = {
        totalEvents: 0,
        criticalEvents: 0,
        highEvents: 0,
        mediumEvents: 0,
        lowEvents: 0,
        eventsByType: {},
        eventsByIP: {},
        topThreats: []
      };

      if (fs.existsSync(this.metricsFile)) {
        const data = fs.readFileSync(this.metricsFile, 'utf-8');
        metrics = JSON.parse(data);
      }

      // Update counters
      metrics.totalEvents++;
      metrics[`${event.severity}Events`]++;
      metrics.eventsByType[event.event] = (metrics.eventsByType[event.event] || 0) + 1;
      metrics.eventsByIP[event.ip] = (metrics.eventsByIP[event.ip] || 0) + 1;

      // Update top threats
      const existingThreat = metrics.topThreats.find(t => t.type === event.event);
      if (existingThreat) {
        existingThreat.count++;
      } else {
        metrics.topThreats.push({
          type: event.event,
          count: 1,
          severity: event.severity
        });
      }

      // Sort top threats by count and severity
      metrics.topThreats.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aSeverity = severityOrder[a.severity as keyof typeof severityOrder];
        const bSeverity = severityOrder[b.severity as keyof typeof severityOrder];
        
        if (aSeverity !== bSeverity) {
          return bSeverity - aSeverity;
        }
        return b.count - a.count;
      });

      // Keep only top 10 threats
      metrics.topThreats = metrics.topThreats.slice(0, 10);

      fs.writeFileSync(this.metricsFile, JSON.stringify(metrics, null, 2));
    } catch (error) {
      console.error('Failed to update security metrics:', error);
    }
  }

  private static triggerAlert(event: SecurityEvent): void {
    // In a real implementation, you'd send alerts via email, Slack, PagerDuty, etc.
    const alertMessage = `
🚨 CRITICAL SECURITY ALERT 🚨
Event: ${event.event}
Severity: ${event.severity}
IP: ${event.ip}
User ID: ${event.userId || 'N/A'}
Timestamp: ${event.timestamp}
Details: ${JSON.stringify(event.details, null, 2)}
    `;

    console.error(alertMessage);

    // Write to separate alert file
    const alertFile = path.join(this.logDir, 'security-alerts.log');
    const alertLine = `[${event.timestamp}] ${alertMessage}\n`;
    fs.appendFileSync(alertFile, alertLine);
  }

  // Get security metrics
  static getMetrics(): SecurityMetrics | null {
    try {
      if (fs.existsSync(this.metricsFile)) {
        const data = fs.readFileSync(this.metricsFile, 'utf-8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('Failed to read security metrics:', error);
      return null;
    }
  }

  // Get recent security events
  static getRecentEvents(limit: number = 100, severity?: string): SecurityEvent[] {
    try {
      if (!fs.existsSync(this.securityLogFile)) {
        return [];
      }

      const data = fs.readFileSync(this.securityLogFile, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line.trim());
      
      let events: SecurityEvent[] = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(event => event !== null);

      // Filter by severity if specified
      if (severity) {
        events = events.filter(event => event.severity === severity);
      }

      // Sort by timestamp (newest first) and limit
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return events.slice(0, limit);
    } catch (error) {
      console.error('Failed to read security events:', error);
      return [];
    }
  }

  // Get IP-based events
  static getEventsByIP(ip: string, limit: number = 50): SecurityEvent[] {
    const allEvents = this.getRecentEvents(1000);
    return allEvents
      .filter(event => event.ip === ip)
      .slice(0, limit);
  }

  // Get events for specific user
  static getEventsByUser(userId: string, limit: number = 50): SecurityEvent[] {
    const allEvents = this.getRecentEvents(1000);
    return allEvents
      .filter(event => event.userId === userId)
      .slice(0, limit);
  }

  // Mark event as resolved
  static markEventResolved(eventId: string): boolean {
    try {
      if (!fs.existsSync(this.securityLogFile)) {
        return false;
      }

      const data = fs.readFileSync(this.securityLogFile, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line.trim());
      
      let found = false;
      const updatedLines = lines.map(line => {
        try {
          const event = JSON.parse(line);
          if (event.id === eventId) {
            event.resolved = true;
            found = true;
          }
          return JSON.stringify(event);
        } catch {
          return line;
        }
      });

      if (found) {
        fs.writeFileSync(this.securityLogFile, updatedLines.join('\n') + '\n');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to mark event as resolved:', error);
      return false;
    }
  }

  // Clear old logs (log rotation)
  static rotateLogs(daysToKeep: number = 30): void {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      if (fs.existsSync(this.securityLogFile)) {
        const data = fs.readFileSync(this.securityLogFile, 'utf-8');
        const lines = data.trim().split('\n').filter(line => line.trim());
        
        const filteredLines = lines.filter(line => {
          try {
            const event = JSON.parse(line);
            return new Date(event.timestamp) > cutoffDate;
          } catch {
            return false;
          }
        });

        // Backup old log file
        const backupFile = `${this.securityLogFile}.old`;
        if (fs.existsSync(this.securityLogFile)) {
          fs.copyFileSync(this.securityLogFile, backupFile);
        }

        // Write filtered data
        fs.writeFileSync(this.securityLogFile, filteredLines.join('\n') + '\n');
      }
    } catch (error) {
      console.error('Failed to rotate logs:', error);
    }
  }

  // Generate security report
  static generateReport(startDate: Date, endDate: Date): {
    summary: SecurityMetrics;
    events: SecurityEvent[];
    recommendations: string[];
  } | null {
    try {
      const events = this.getRecentEvents(10000);
      const filteredEvents = events.filter(event => {
        const eventDate = new Date(event.timestamp);
        return eventDate >= startDate && eventDate <= endDate;
      });

      const summary: SecurityMetrics = {
        totalEvents: filteredEvents.length,
        criticalEvents: filteredEvents.filter(e => e.severity === 'critical').length,
        highEvents: filteredEvents.filter(e => e.severity === 'high').length,
        mediumEvents: filteredEvents.filter(e => e.severity === 'medium').length,
        lowEvents: filteredEvents.filter(e => e.severity === 'low').length,
        eventsByType: {},
        eventsByIP: {},
        topThreats: []
      };

      // Calculate events by type and IP
      filteredEvents.forEach(event => {
        summary.eventsByType[event.event] = (summary.eventsByType[event.event] || 0) + 1;
        summary.eventsByIP[event.ip] = (summary.eventsByIP[event.ip] || 0) + 1;
      });

      // Generate recommendations
      const recommendations: string[] = [];
      
      if (summary.criticalEvents > 0) {
        recommendations.push('Investigate critical security events immediately');
      }
      
      if (summary.highEvents > 10) {
        recommendations.push('Consider implementing additional security measures for high-severity events');
      }
      
      const topIP = Object.entries(summary.eventsByIP)
        .sort(([,a], [,b]) => b - a)[0];
      
      if (topIP && topIP[1] > 50) {
        recommendations.push(`Monitor IP ${topIP[0]} for suspicious activity (${topIP[1]} events)`);
      }

      return {
        summary,
        events: filteredEvents,
        recommendations
      };
    } catch (error) {
      console.error('Failed to generate security report:', error);
      return null;
    }
  }
}

// Schedule log rotation (daily at midnight)
const scheduleLogRotation = () => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    SecurityMonitor.rotateLogs();
    // Schedule next rotation
    setInterval(() => SecurityMonitor.rotateLogs(), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
};

scheduleLogRotation();

export default SecurityMonitor;