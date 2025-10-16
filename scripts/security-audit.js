#!/usr/bin/env node

/**
 * Security Audit Script for WhatsApp CMS
 * 
 * This script performs comprehensive security checks including:
 * - Dependency vulnerability scanning
 * - Code security analysis
 * - Configuration security review
 * - File permission checks
 * - Environment variable validation
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface SecurityAuditResult {
  overall: 'PASS' | 'FAIL' | 'WARNING';
  checks: {
    dependencies: SecurityCheck;
    code: SecurityCheck;
    configuration: SecurityCheck;
    files: SecurityCheck;
    environment: SecurityCheck;
  };
  recommendations: string[];
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

interface SecurityCheck {
  status: 'PASS' | 'FAIL' | 'WARNING';
  issues: SecurityIssue[];
}

interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  recommendation: string;
  file?: string;
  line?: number;
}

class SecurityAuditor {
  private projectRoot: string;
  private results: SecurityAuditResult;

  constructor() {
    this.projectRoot = process.cwd();
    this.results = {
      overall: 'PASS',
      checks: {
        dependencies: { status: 'PASS', issues: [] },
        code: { status: 'PASS', issues: [] },
        configuration: { status: 'PASS', issues: [] },
        files: { status: 'PASS', issues: [] },
        environment: { status: 'PASS', issues: [] }
      },
      recommendations: [],
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0
    };
  }

  async runFullAudit(): Promise<SecurityAuditResult> {
    console.log('🔍 Starting Security Audit for WhatsApp CMS...\n');

    await this.checkDependencies();
    await this.analyzeCode();
    await this.checkConfiguration();
    await this.checkFilePermissions();
    await this.checkEnvironment();

    this.calculateOverallScore();
    this.generateRecommendations();

    return this.results;
  }

  private async checkDependencies(): Promise<void> {
    console.log('📦 Checking dependencies for vulnerabilities...');

    try {
      // Run npm audit
      const auditOutput = execSync('npm audit --json', { encoding: 'utf-8' });
      const auditResult = JSON.parse(auditOutput);

      if (auditResult.vulnerabilities) {
        Object.values(auditResult.vulnerabilities).forEach((vuln: any) => {
          this.addIssue('dependencies', {
            severity: this.mapNpmSeverity(vuln.severity),
            category: 'Dependency Vulnerability',
            description: `${vuln.name}: ${vuln.title}`,
            recommendation: `Update to version ${vuln.fixAvailable ? 'latest' : 'compatible version'}`
          });
        });
      }

      // Check for outdated packages
      try {
        const outdatedOutput = execSync('npm outdated --json', { encoding: 'utf-8' });
        if (outdatedOutput.trim()) {
          this.addIssue('dependencies', {
            severity: 'medium',
            category: 'Outdated Dependencies',
            description: 'Some dependencies are outdated',
            recommendation: 'Update dependencies to latest stable versions'
          });
        }
      } catch (error) {
        // npm outdated exits with code 1 when packages are outdated
      }

    } catch (error) {
      this.addIssue('dependencies', {
        severity: 'high',
        category: 'Audit Error',
        description: 'Failed to run dependency audit',
        recommendation: 'Check npm configuration and network connectivity'
      });
    }

    console.log(`✅ Dependencies check completed\n`);
  }

  private async analyzeCode(): Promise<void> {
    console.log('🔍 Analyzing source code for security issues...');

    const codeFiles = this.findCodeFiles();
    
    for (const file of codeFiles) {
      await this.analyzeFile(file);
    }

    // Check for hardcoded secrets
    await this.checkForSecrets();

    console.log(`✅ Code analysis completed\n`);
  }

  private findCodeFiles(): string[] {
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    const files: string[] = [];

    const scanDirectory = (dir: string) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          scanDirectory(fullPath);
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    };

    scanDirectory(path.join(this.projectRoot, 'src'));
    scanDirectory(path.join(this.projectRoot, 'app'));
    scanDirectory(path.join(this.projectRoot, 'lib'));
    scanDirectory(path.join(this.projectRoot, 'components'));

    return files;
  }

  private async analyzeFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Check for console.log in production code
        if (line.includes('console.log') && !filePath.includes('node_modules')) {
          this.addIssue('code', {
            severity: 'low',
            category: 'Debug Code',
            description: 'Console.log statement found in production code',
            recommendation: 'Remove console.log statements or use proper logging',
            file: filePath,
            line: index + 1
          });
        }

        // Check for hardcoded passwords
        if (line.match(/password\s*=\s*['"][^'"]+['"]/i)) {
          this.addIssue('code', {
            severity: 'critical',
            category: 'Hardcoded Secret',
            description: 'Hardcoded password found',
            recommendation: 'Use environment variables for secrets',
            file: filePath,
            line: index + 1
          });
        }

        // Check for SQL injection vulnerabilities
        if (line.includes('SELECT') && line.includes('${') && line.includes('+')) {
          this.addIssue('code', {
            severity: 'high',
            category: 'SQL Injection',
            description: 'Potential SQL injection vulnerability',
            recommendation: 'Use parameterized queries or ORM',
            file: filePath,
            line: index + 1
          });
        }

        // Check for eval usage
        if (line.includes('eval(')) {
          this.addIssue('code', {
            severity: 'critical',
            category: 'Code Injection',
            description: 'Usage of eval() function',
            recommendation: 'Remove eval() usage, use safer alternatives',
            file: filePath,
            line: index + 1
          });
        }

        // Check for innerHTML usage
        if (line.includes('innerHTML')) {
          this.addIssue('code', {
            severity: 'medium',
            category: 'XSS Risk',
            description: 'Usage of innerHTML detected',
            recommendation: 'Use textContent or proper sanitization',
            file: filePath,
            line: index + 1
          });
        }
      });
    } catch (error) {
      console.warn(`Warning: Could not analyze file ${filePath}`);
    }
  }

  private async checkForSecrets(): Promise<void> {
    console.log('🔑 Checking for hardcoded secrets...');

    const secretPatterns = [
      { pattern: /['"]AIza[A-Za-z0-9_-]{35}['"]/, type: 'Google API Key' },
      { pattern: /['"]sk_live_[a-zA-Z0-9]{24,}['"]/, type: 'Stripe Live Key' },
      { pattern: /['"]xoxb-[0-9]{10,}-[a-zA-Z0-9-]{24,}['"]/, type: 'Slack Bot Token' },
      { pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/, type: 'GitHub Personal Token' },
      { pattern: /['"]AKIA[0-9A-Z]{16}['"]/, type: 'AWS Access Key' },
      { pattern: /['"][\w-]{32,}['"].*['"][\w-]{32,}['"]/, type: 'Possible API Key Pair' }
    ];

    const files = this.findCodeFiles();
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        
        secretPatterns.forEach(({ pattern, type }) => {
          if (pattern.test(content)) {
            this.addIssue('code', {
              severity: 'critical',
              category: 'Hardcoded Secret',
              description: `${type} found in source code`,
              recommendation: 'Move secrets to environment variables',
              file
            });
          }
        });
      } catch (error) {
        // Skip files that can't be read
      }
    }

    console.log(`✅ Secret scanning completed\n`);
  }

  private async checkConfiguration(): Promise<void> {
    console.log('⚙️  Checking configuration security...');

    // Check .env file
    if (fs.existsSync('.env')) {
      const envContent = fs.readFileSync('.env', 'utf-8');
      
      if (envContent.includes('password=') || envContent.includes('secret=')) {
        this.addIssue('configuration', {
          severity: 'medium',
          category: 'Environment Security',
          description: 'Sensitive data in .env file',
          recommendation: 'Use secure secret management system'
        });
      }
    }

    // Check package.json scripts
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      
      if (packageJson.scripts) {
        Object.values(packageJson.scripts).forEach((script: any) => {
          if (typeof script === 'string' && script.includes('--inspect')) {
            this.addIssue('configuration', {
              severity: 'medium',
              category: 'Debug Configuration',
              description: 'Debug mode enabled in production scripts',
              recommendation: 'Remove debug flags from production scripts'
            });
          }
        });
      }
    } catch (error) {
      this.addIssue('configuration', {
        severity: 'high',
        category: 'Configuration Error',
        description: 'Invalid package.json',
        recommendation: 'Fix package.json syntax'
      });
    }

    // Check Next.js configuration
    if (fs.existsSync('next.config.js')) {
      const nextConfig = fs.readFileSync('next.config.js', 'utf-8');
      
      if (nextConfig.includes('reactStrictMode: false')) {
        this.addIssue('configuration', {
          severity: 'low',
          category: 'React Configuration',
          description: 'React Strict Mode disabled',
          recommendation: 'Enable React Strict Mode for better security'
        });
      }
    }

    console.log(`✅ Configuration check completed\n`);
  }

  private async checkFilePermissions(): Promise<void> {
    console.log('📁 Checking file permissions...');

    const sensitiveFiles = [
      '.env',
      '.env.local',
      '.env.production',
      'package.json',
      'tsconfig.json'
    ];

    for (const file of sensitiveFiles) {
      if (fs.existsSync(file)) {
        try {
          const stats = fs.statSync(file);
          const mode = stats.mode;

          // Check if file is readable by others (octal 004)
          if (mode & 0o004) {
            this.addIssue('files', {
              severity: 'medium',
              category: 'File Permissions',
              description: `${file} is readable by others`,
              recommendation: `Restrict permissions: chmod 600 ${file}`
            });
          }
        } catch (error) {
          this.addIssue('files', {
            severity: 'low',
            category: 'File Access',
            description: `Cannot check permissions for ${file}`,
            recommendation: 'Ensure file exists and is accessible'
          });
        }
      }
    }

    // Check for executable files in web root
    const webRootFiles = fs.readdirSync('.');
    const executables = webRootFiles.filter(file => {
      try {
        const stats = fs.statSync(file);
        return stats.isFile() && (stats.mode & 0o111);
      } catch {
        return false;
      }
    });

    if (executables.length > 0) {
      this.addIssue('files', {
        severity: 'medium',
        category: 'Executable Files',
        description: `Executable files found in web root: ${executables.join(', ')}`,
        recommendation: 'Remove executable permissions from web-accessible files'
      });
    }

    console.log(`✅ File permissions check completed\n`);
  }

  private async checkEnvironment(): Promise<void> {
    console.log('🌍 Checking environment security...');

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion < 18) {
      this.addIssue('environment', {
        severity: 'high',
        category: 'Outdated Runtime',
        description: `Node.js version ${nodeVersion} is outdated`,
        recommendation: 'Upgrade to Node.js 18 LTS or later'
      });
    }

    // Check environment variables
    const sensitiveEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];
    
    sensitiveEnvVars.forEach(envVar => {
      if (process.env[envVar]) {
        if (process.env[envVar]!.length < 32) {
          this.addIssue('environment', {
            severity: 'medium',
            category: 'Weak Secrets',
            description: `${envVar} appears to be too short`,
            recommendation: 'Use stronger, longer secrets'
          });
        }
      }
    });

    // Check for development mode in production
    if (process.env.NODE_ENV === 'development') {
      this.addIssue('environment', {
        severity: 'low',
        category: 'Development Mode',
        description: 'Application running in development mode',
        recommendation: 'Use NODE_ENV=production in production'
      });
    }

    console.log(`✅ Environment check completed\n`);
  }

  private addIssue(category: keyof SecurityAuditResult['checks'], issue: SecurityIssue): void {
    this.results.checks[category].issues.push(issue);
    
    if (this.results.checks[category].status === 'PASS') {
      this.results.checks[category].status = issue.severity === 'low' ? 'WARNING' : 'FAIL';
    }

    // Count issues by severity
    switch (issue.severity) {
      case 'critical':
        this.results.criticalIssues++;
        break;
      case 'high':
        this.results.highIssues++;
        break;
      case 'medium':
        this.results.mediumIssues++;
        break;
      case 'low':
        this.results.lowIssues++;
        break;
    }
  }

  private mapNpmSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'moderate': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  private calculateOverallScore(): void {
    if (this.results.criticalIssues > 0) {
      this.results.overall = 'FAIL';
    } else if (this.results.highIssues > 0) {
      this.results.overall = 'FAIL';
    } else if (this.results.mediumIssues > 0) {
      this.results.overall = 'WARNING';
    } else {
      this.results.overall = 'PASS';
    }
  }

  private generateRecommendations(): void {
    if (this.results.criticalIssues > 0) {
      this.results.recommendations.push('🚨 CRITICAL: Address all critical security issues immediately');
    }

    if (this.results.highIssues > 0) {
      this.results.recommendations.push('⚠️  HIGH: Prioritize fixing high-severity security issues');
    }

    if (this.results.mediumIssues > 0) {
      this.results.recommendations.push('📋 MEDIUM: Schedule time to address medium-severity issues');
    }

    // General recommendations
    this.results.recommendations.push('🔄 Set up automated security scanning in CI/CD pipeline');
    this.results.recommendations.push('📧 Configure security alerts for dependency updates');
    this.results.recommendations.push('🛡️  Implement Content Security Policy (CSP) headers');
    this.results.recommendations.push('🔐 Use environment-specific configurations');
    this.results.recommendations.push('📊 Regular security audits and penetration testing');
  }

  printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SECURITY AUDIT REPORT');
    console.log('='.repeat(60));
    
    console.log(`\nOverall Status: ${this.getStatusEmoji(this.results.overall)} ${this.results.overall}`);
    console.log(`Critical Issues: ${this.results.criticalIssues}`);
    console.log(`High Issues: ${this.results.highIssues}`);
    console.log(`Medium Issues: ${this.results.mediumIssues}`);
    console.log(`Low Issues: ${this.results.lowIssues}`);

    // Print detailed results for each category
    Object.entries(this.results.checks).forEach(([category, check]) => {
      console.log(`\n${category.toUpperCase()}: ${this.getStatusEmoji(check.status)} ${check.status}`);
      
      if (check.issues.length > 0) {
        check.issues.forEach(issue => {
          const severityIcon = this.getSeverityIcon(issue.severity);
          console.log(`  ${severityIcon} ${issue.description}`);
          if (issue.file) {
            console.log(`     📁 ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
          }
          console.log(`     💡 ${issue.recommendation}\n`);
        });
      } else {
        console.log('  ✅ No issues found\n');
      }
    });

    // Print recommendations
    console.log('📋 RECOMMENDATIONS:');
    this.results.recommendations.forEach(rec => {
      console.log(`  ${rec}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Security Audit Complete');
    console.log('='.repeat(60));
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'PASS': return '✅';
      case 'FAIL': return '❌';
      case 'WARNING': return '⚠️';
      default: return '❓';
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '📋';
      case 'low': return 'ℹ️';
      default: return '❓';
    }
  }
}

// Run the audit if this script is executed directly
if (require.main === module) {
  const auditor = new SecurityAuditor();
  
  auditor.runFullAudit()
    .then(results => {
      auditor.printResults();
      
      // Exit with appropriate code
      process.exit(
        results.overall === 'FAIL' ? 1 :
        results.overall === 'WARNING' ? 2 : 0
      );
    })
    .catch(error => {
      console.error('❌ Audit failed:', error);
      process.exit(3);
    });
}

export { SecurityAuditor, SecurityAuditResult };