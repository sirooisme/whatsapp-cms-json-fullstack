# Project Requirements Document: whatsapp-cms-json-fullstack

## 1. Project Overview
This project delivers a full-stack, JSON-based Customer Management System (CMS) built on Next.js that integrates with WhatsApp for real-time messaging. Agents and administrators can sign in, manage contacts and chats, and send or receive WhatsApp messages—all data is stored in simple JSON files under a secure `/data` folder. This eliminates the need for a traditional database, simplifies deployment, and meets the requirement of JSON-only persistence.

The CMS aims to solve the challenge of providing a lightweight, self-hosted customer-service platform where multiple agents can securely handle WhatsApp conversations without complex infrastructure. Success is measured by a working multi-role authentication flow, reliable JSON file I/O, seamless WhatsApp integration (via Baileys or whatsapp-web.js), and a polished, responsive UI styled with Tailwind CSS and Shadcn/ui.

## 2. In-Scope vs. Out-of-Scope

### In-Scope (Version 1.0)
- User authentication (sign-up, sign-in, sign-out) with role field (`agent` or `admin`) using Better Auth.  
- Secure dashboards: `/dashboard` for agents, `/admin/dashboard` for administrators.  
- JSON-based data layer (`/lib/json-db.ts`) for all CRUD operations on `users.json`, `contacts.json`, and `chats.json`.  
- WhatsApp messaging service (`/lib/whatsapp-service.ts`) to send/receive messages via Baileys or whatsapp-web.js.  
- Protected API routes under `/app/api/` for auth, chat retrieval, message sending, and contact management.  
- UI components: chat window, contact list, agent assignment modal, and role-aware navigation—built with Shadcn/ui and Tailwind CSS.  
- Basic file-locking or queuing in JSON-DB to prevent race conditions.  
- Input validation with Zod in all API routes.  
- Middleware (`middleware.ts`) enforcing route protection and role-based access control (RBAC).  
- Unit tests (Jest) for JSON-DB and integration tests for API routes.  

### Out-of-Scope (Planned for Later)
- Support for image or document attachments over WhatsApp.  
- Advanced analytics dashboards (charts, reports).  
- Mobile-native (React Native or Swift).  
- External database or SQL support beyond JSON files.  
- Multi-tenant or white-label deployments.  
- Full audit trail or extensive logging beyond basic error tracking.  

## 3. User Flow
A new customer-service agent or administrator navigates to the web app’s landing page and signs up using their email and password. After verifying and setting their role, they sign in and are redirected—agents to `/dashboard`, admins to `/admin/dashboard`. The layout features a sidebar with navigation links (Contacts, Chats, Settings) and a main panel showing either a contact list (agents) or user-management tools (admins).

Agents click a contact to open a chat window side-by-side with the contact list. Incoming WhatsApp messages appear in real time via WebSocket or polling from the `/api/whatsapp/receive` route. When agents type replies, the UI calls `/api/whatsapp/send`, which sends the message through the WhatsApp service and persists it in `chats.json`. Administrators can view all agents, assign chats, modify user roles, and review system status on their dashboard.

## 4. Core Features
- **Authentication & RBAC**: Sign-up, login, logout; roles ‘agent’ and ‘admin’; protected routes and UI components.  
- **JSON Data Service**: `/lib/json-db.ts` exposing functions like `getUsers()`, `getChats(agentId)`, `saveMessage(chatId, message)`, with file-locking.  
- **WhatsApp Integration**: `/lib/whatsapp-service.ts` managing a persistent Baileys client; endpoints `/api/whatsapp/send` and `/api/whatsapp/receive`.  
- **Agent Dashboard**: Contact list, chat UI, real-time updates, message history.  
- **Admin Dashboard**: User list, role management, agent-chat assignments, simple system metrics.  
- **UI Components**: Reusable Shadcn/ui and Tailwind CSS elements for lists, modals, forms, navbars.  
- **Input Validation**: Zod schemas for all API requests to prevent malformed data.  
- **Testing**: Jest unit tests for JSON-DB; integration tests for APIs and auth.  

## 5. Tech Stack & Tools
- **Frontend**: Next.js (App Router), React, TypeScript for type safety.  
- **Styling**: Tailwind CSS v4, Shadcn/ui component library for rapid, consistent UI.  
- **Backend**: Next.js API Routes on Node.js v22, Better Auth for authentication.  
- **Data Layer**: Custom JSON-DB service using Node `fs` module with locking logic.  
- **WhatsApp Library**: Baileys (recommended) or whatsapp-web.js for messaging.  
- **Validation**: Zod for runtime schema checks.  
- **Testing**: Jest for unit and integration tests.  
- **IDE/Plugins**: VS Code with Prettier, ESLint; optional Cursor or Windsurf for AI-powered code assistance.  

## 6. Non-Functional Requirements
- UI response under 200 ms for navigation between pages.  
- API endpoints respond within 300 ms for read operations, 500 ms for writes.  
- File I/O must be atomic; no data corruption under concurrent requests.  
- All API routes secured with HTTPS, HttpOnly + Secure cookies, SameSite=strict.  
- Input data passes Zod validation; invalid requests return 4xx errors with clear messages.  
- Code coverage ≥ 80% for JSON-DB service.  
- Deployment environment: Node.js v22, single Linux server or Docker container.  

## 7. Constraints & Assumptions
- The server environment supports long-running processes (for Baileys state).  
- `/data` folder is writable by the server and not served publicly.  
- WhatsApp library tokens or session files are securely stored (e.g., outside `/public`).  
- No SQL database will be available; all data must persist in JSON.  
- Better Auth’s session store meets scaling requirements (in-memory or backing store).  

## 8. Known Issues & Potential Pitfalls
- **Race Conditions**: Concurrent writes to JSON files may corrupt data.  
  Mitigation: implement file locks or a write queue in `json-db.ts`.
- **Serverless Limitations**: Next.js serverless deployments may restart the WhatsApp client.  
  Mitigation: use a single dedicated Node.js server (not serverless) or an external stateful service.
- **Authentication Scaling**: In-memory sessions won’t scale across multiple instances.  
  Mitigation: configure a shared session store (Redis) if clustering is needed.
- **WhatsApp Rate Limits**: The WhatsApp Web API can throttle if messages are sent too quickly.  
  Mitigation: add client-side rate limiting or queue messages in the service.
- **Data Growth**: JSON files can become large over time.  
  Mitigation: implement file rotation or split by date/agent folders if needed.

---
This PRD provides a crystal-clear blueprint for building the JSON-based WhatsApp CMS. Subsequent technical specifications—file structures, API contracts, frontend guidelines—can be derived directly from these requirements without ambiguity.