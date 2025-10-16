# Backend Structure Document

## 1. Backend Architecture

This project uses a modular, layered architecture built on Next.js (App Router) running on Node.js. We organize code into clear layers: API routes handle HTTP requests, service modules encapsulate business logic, and shared utilities manage common tasks. Key design patterns and frameworks:

- Next.js API Routes: organizes HTTP endpoints alongside page routes in the `/app/api` directory.  
- Service Layer (in `/lib`): each service (e.g., JSON-DB, WhatsApp client) follows a repository or singleton pattern to isolate data access and external integrations.  
- Zod for Schema Validation: validates all incoming data in API routes before business logic runs.  
- Role-Based Access Control: implemented via Next.js middleware to guard routes based on user roles (`admin` vs. `agent`).

How this supports scalability, maintainability, and performance:

- Scalability: services are stateless and can run behind multiple instances; the JSON-DB layer can be swapped for another store without changing API logic.  
- Maintainability: clear separation of concerns—API routes don’t directly access the file system or WhatsApp client.  
- Performance: lightweight JSON files and in-memory caching (optional Redis layer) allow fast reads; persistent connections to WhatsApp client reduce latency.

---

## 2. Database Management

We use a file-based JSON “database” stored on a secure server volume. Data is organized into separate JSON files by entity type:

- users.json: user accounts and roles  
- chats.json: chat sessions and metadata  
- messages.json: individual messages  
- contacts.json: user contact lists

Data access practices:

- All file reads/writes go through the `/lib/json-db.ts` service.  
- File locking or a write queue ensures no two processes write to the same file simultaneously.  
- Zod schemas validate objects before they’re stored to prevent malformed data.  
- Periodic backups (nightly) copy JSON files to an off-site store (e.g., S3) for disaster recovery.

---

## 3. Database Schema (JSON-Based)

Below is a human-readable outline of each JSON file’s structure.

### users.json
- id: unique string  
- name: user’s full name  
- email: unique login email  
- hashedPassword: salted hash  
- role: `admin` or `agent`  
- createdAt: ISO timestamp

### chats.json
- id: unique string  
- participantIds: list of user IDs  
- lastMessageAt: ISO timestamp  
- status: `open` or `closed`

### messages.json
- id: unique string  
- chatId: ID of the chat session  
- senderId: user ID who sent it  
- content: text payload  
- timestamp: ISO timestamp  
- direction: `inbound` or `outbound`

### contacts.json
- id: unique string  
- userId: owner’s user ID  
- name: contact’s display name  
- phone: E.164 phone number

---

## 4. API Design and Endpoints

We follow a RESTful approach using Next.js API routes. All routes live under `/app/api`.

### Authentication
- **POST /api/auth/signup**: create new user  
- **POST /api/auth/login**: email & password → session cookie  
- **POST /api/auth/logout**: clear session cookie  

### Users (Admin Only)
- **GET /api/users**: list all users  
- **GET /api/users/:id**: get single user  
- **PUT /api/users/:id**: update user role or info  
- **DELETE /api/users/:id**: remove a user

### Chats & Messages
- **GET /api/chats**: list chats for current user  
- **GET /api/chats/:chatId**: get chat details + messages  
- **POST /api/chats/:chatId/messages**: send a new message (writes to JSON + forwards to WhatsApp)

### Contacts
- **GET /api/contacts**: list contacts for current user  
- **POST /api/contacts**: add new contact  
- **DELETE /api/contacts/:id**: remove contact

### WhatsApp Service
- **POST /api/whatsapp/send**: { chatId, content } → gateway to WhatsApp client  
- **POST /api/whatsapp/webhook**: receives incoming messages from WhatsApp and persists them

Each endpoint:
- Runs input validation (Zod)  
- Checks session & role (via middleware)  
- Delegates to service modules (`json-db`, `whatsapp-service`)

---

## 5. Hosting Solutions

We recommend hosting the backend on AWS using a containerized approach:

- **Compute**: AWS ECS on Fargate (serverless containers)  
- **Storage**: Amazon EFS (Network File System) mounted to containers for `/data` persistence  
- **Load Balancing**: Application Load Balancer (ALB) distributes traffic across ECS tasks  
- **DNS & CDN**: Route 53 for DNS; CloudFront for global caching of frontend assets

Benefits:
- Reliability: auto-restarts failed tasks, multi-AZ deployment  
- Scalability: Fargate scales tasks on demand; ALB handles traffic spikes  
- Cost-Effectiveness: pay only for compute time; EFS scales storage automatically

---

## 6. Infrastructure Components

- **Load Balancer (ALB)**: routes HTTP(s) traffic, performs health checks  
- **ECS Fargate**: runs Node.js containers; stateless API workers  
- **Amazon EFS**: shared, persistent volume for JSON files  
- **CloudFront CDN**: caches static assets (JS, CSS, images) for fast global delivery  
- **Redis Cache (optional)**: in-memory caching for frequent reads (e.g., recent messages)  
- **Secrets Manager / Parameter Store**: stores environment variables and API keys securely  
- **CI/CD Pipeline**: GitHub Actions build → test → deploy to ECS

These components work together to ensure low latency, high availability, and smooth scaling.

---

## 7. Security Measures

- **Authentication & Authorization**: session cookies with HttpOnly, Secure, SameSite flags; RBAC enforced via middleware  
- **Data Encryption**: HTTPS/TLS for all traffic; EFS encryption at rest; environment variables encrypted in Secrets Manager  
- **Input Validation**: Zod schemas on every API route to prevent malformed or malicious payloads  
- **Rate Limiting**: protect login and messaging endpoints against brute-force and DDoS  
- **File System Hardening**: `/data` directory permissions restricted to application user  
- **Dependency Audits**: automated `npm audit` in CI; lockfile updates

---

## 8. Monitoring and Maintenance

- **Logging**: CloudWatch Logs aggregates application logs  
- **Metrics & Alerts**: CloudWatch Metrics for CPU, memory, request latency; alarms trigger Slack notifications  
- **Error Tracking**: Sentry captures uncaught exceptions and stack traces  
- **Health Checks**: ALB /health endpoint to verify app availability  
- **Backups**: nightly cron job copies `/data` JSON files to S3  
- **Dependency Updates**: Dependabot alerts and automated PRs for vulnerability fixes

---

## 9. Conclusion and Overall Backend Summary

This backend structure delivers a clear, maintainable foundation for a WhatsApp-based CMS. By combining Next.js API routes, a modular service layer, and a JSON-file database, we meet the requirement for simple, flat data storage and role-based user management. AWS hosting with ECS, EFS, and CloudFront ensures the system is reliable, scalable, and cost-efficient. Security and observability are baked in through validation, encryption, monitoring, and backups. Overall, this setup gives developers a straightforward, secure platform to build and extend the WhatsApp CMS without infrastructure friction.