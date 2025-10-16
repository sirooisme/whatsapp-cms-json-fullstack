# Security Guidelines for `whatsapp-cms-json-fullstack`

This document provides actionable security best practices tailored to the `whatsapp-cms-json-fullstack` repository. It embeds security by design, least privilege, defense in depth, and other core principles from the initial design through deployment.

---

## 1. Authentication & Access Control

### 1.1 Robust Authentication
- Leverage Better Auth’s secure password hashing (e.g., bcrypt/Argon2) with unique salts. Ensure the default scheme meets OWASP recommendations.
- Enforce strong password policies: minimum 12 characters, at least one uppercase, one lowercase, one digit, and one special character.
- Implement account lockout or rate-limiting on failed sign-in attempts to thwart brute-force attacks.

### 1.2 Session Management & Secure Cookies
- Use **Secure**, **HttpOnly**, and **SameSite=Strict** flags on session cookies. 
- Enforce idle and absolute timeouts (e.g., idle timeout: 15 min, absolute timeout: 8 hours).
- Provide explicit logout endpoints that destroy server-side session state and clear cookies.
- Protect against session fixation by regenerating session identifiers upon login.

### 1.3 Role-Based Access Control (RBAC)
- Extend user schema (`users.json`) with a mandatory `role` field: `'admin'` or `'agent'`.
- Centralize role checks in Next.js Middleware (`middleware.ts`) to guard:
  - `/api/*` routes
  - `/dashboard/*` pages (agent)
  - `/admin/dashboard/*` pages (admin)
- Fail closed: deny access by default if role validation fails.

### 1.4 Multi-Factor Authentication (MFA)
- Consider integrating an optional TOTP-based MFA for admin users.
- Store MFA secrets encrypted in a separate JSON file with strict file permissions.

---

## 2. Input Handling & Processing

### 2.1 Input Validation & Schema Enforcement
- Use Zod schemas in every API route (`/app/api/*`) to validate request payloads prior to any processing or file writes.
- Reject or sanitize unexpected fields to prevent injection or data corruption.

### 2.2 Prevent Injection Attacks
- Avoid dynamic evaluation of user input. All JSON file writes must go through the typed `json-db.ts` service.
- Do _not_ interpolate user-supplied strings into file paths. Validate filenames against an allow-list or fixed map.

### 2.3 Secure File Uploads (If Applicable)
- If future features include file attachments:
  - Validate file extensions and MIME types.
  - Enforce maximum file size limits.
  - Scan files with an antivirus/malware scanner before saving.
  - Store uploads outside the webroot under `/data/uploads`.

### 2.4 Prevent Template & XSS Injection
- Use React’s built-in escaping (avoid `dangerouslySetInnerHTML`).
- If rendering HTML snippets, sanitize with a library like DOMPurify.
- Set a strict Content Security Policy (CSP) header to disallow inline scripts/styles.

---

## 3. Data Protection & Privacy

### 3.1 Secure JSON Storage
- Store all data files in a non-public `/data` directory and add it to `.gitignore`.
- Assign restrictive file permissions (e.g., 600 for user-readable/writable only by the service account).
- Implement file-locking or a write queue in `json-db.ts` to prevent concurrent write corruption.

### 3.2 Encryption & Secrecy
- Never commit API keys, session secrets, or credentials to source control. Use environment variables or a secrets manager.
- If JSON data contains PII, consider encrypting at rest using AES-256. Decrypt only in memory when needed.

### 3.3 Prevent Information Leakage
- Sanitize error messages: return generic error responses (e.g., “Invalid request”) to clients. Log detailed errors server-side.
- Mask PII in logs and audit trails (e.g., only log user IDs, not phone numbers).

---

## 4. API & Service Security

### 4.1 Enforce HTTPS
- Require HTTPS in all environments. Redirect HTTP → HTTPS.
- Use strong TLS configurations (TLSv1.2+, disable weak ciphers).

### 4.2 Rate Limiting & Throttling
- Implement rate limiting (e.g., 100 requests/minute per IP) on sensitive endpoints like `/api/auth` and `/api/whatsapp`.
- Return HTTP 429 on limit exceeded.

### 4.3 CORS Configuration
- Restrict CORS to trusted UI origins only.
- Do not use wildcard (`*`) for Access-Control-Allow-Origin in production.

### 4.4 WhatsApp Service Integration
- Encapsulate Baileys client in a singleton (`whatsapp-service.ts`) to avoid reauthentication on each request.
- Validate all incoming WhatsApp payloads (webhook events) against expected schemas.
- Sign and verify webhook callbacks if supported by the library.

### 4.5 API Versioning
- Prefix API routes with a version (e.g., `/api/v1/whatsapp/send`).
- Deprecate old versions gracefully.

---

## 5. Web Application Security Hygiene

### 5.1 CSRF Protection
- Use anti-CSRF tokens (synchronizer token pattern) for all state-changing requests (e.g., sending messages, user updates).
- Store CSRF token in a secure, HttpOnly cookie.

### 5.2 Security Headers
- **Strict-Transport-Security:** `max-age=63072000; includeSubDomains; preload`
- **X-Content-Type-Options:** `nosniff`
- **X-Frame-Options:** `DENY`
- **Content-Security-Policy:** restrict to self for scripts/styles, fonts, images.
- **Referrer-Policy:** `no-referrer-when-downgrade`

### 5.3 Secure Client-Side Storage
- Do not store JWTs or sensitive tokens in localStorage or sessionStorage.
- If using JWTs, store them in Secure, HttpOnly cookies only.

### 5.4 Subresource Integrity (SRI)
- Add SRI hashes for any third-party CDN scripts/CSS.

---

## 6. Infrastructure & Configuration Management

### 6.1 Server & Environment Hardening
- Run the Next.js server under a dedicated, low-privilege service account.
- Disable directory listing and unnecessary server modules.
- Keep Node.js, Next.js, and all dependencies up to date.

### 6.2 Secrets Management
- Use a dedicated secrets vault (e.g., AWS Secrets Manager, HashiCorp Vault) for database credentials, session secrets, and WhatsApp tokens.
- Rotate secrets regularly.

### 6.3 Secure Logging & Monitoring
- Centralize logs in a secure service (e.g., AWS CloudWatch, ELK).
- Monitor for anomalous login attempts, error spikes, or suspicious API usage.

---

## 7. Dependency Management

- Maintain a lockfile (`package-lock.json`) to ensure deterministic builds.
- Regularly scan dependencies with tools like `npm audit`, `Snyk`, or `Dependabot` for known vulnerabilities.
- Only include necessary libraries (e.g., Zod, Baileys) and remove unused ones.

---

## 8. Testing & Validation

- **Unit Tests**: Cover `json-db.ts` and `whatsapp-service.ts`, mocking file I/O and external connections.
- **Integration Tests**: Validate full API routes, including authentication flows and RBAC enforcement.
- **Security Tests**: Use automated scanners (e.g., OWASP ZAP) against staging deployments.

---

By following these guidelines, the `whatsapp-cms-json-fullstack` application will uphold a strong security posture from development through production, ensuring data integrity, confidentiality, and availability for your WhatsApp CMS solution.