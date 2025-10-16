# Frontend Guideline Document

## 1. Frontend Architecture

### Overview
This project’s frontend is built on Next.js (App Router) and TypeScript, using Shadcn/ui components styled with Tailwind CSS v4. It follows a modular structure with clearly separated directories for pages (`/app`), reusable components (`/components`), and shared utilities (`/lib`). API routes live alongside pages under `/app/api`, keeping client and server code in one place.

### Scalability
- **Modular directories**: Splitting code into `/app`, `/components`, and `/lib` means teams can work on different areas without conflicts. New features slot into this structure easily.
- **Component-based**: Each UI element lives in its own file. As the app grows, components stay self-contained and reusable.

### Maintainability
- **TypeScript**: Catches errors at compile time and makes refactoring safer.
- **Shared utilities**: Common logic (e.g., API calls, auth helpers) lives in `/lib`, avoiding duplication.
- **File-based routing**: Next.js auto-generates routes from file names, reducing manual config and routing bugs.

### Performance
- **Server-side rendering (SSR) & static generation**: Next.js renders critical pages on the server or at build time, giving fast first loads.
- **Code splitting**: Each route and dynamically imported component only loads what it needs.
- **Built-in image optimization**: Next.js `<Image>` component automatically serves optimized images.

## 2. Design Principles

1. **Usability**: Clean, minimal layouts with clear call-to-actions. Key actions (e.g., sending a message) are easy to find.
2. **Accessibility**: Semantic HTML, ARIA attributes on interactive elements, high-contrast text, keyboard navigation support.
3. **Responsiveness**: Mobile-first design. Layouts adapt from small screens (one-column chat view) to desktops (side-by-side lists).
4. **Consistency**: UI components share spacing, typography, and color rules. This makes the experience predictable.
5. **Performance-aware**: Components load quickly, and expensive operations (like large lists) use virtualization or pagination.

## 3. Styling and Theming

### Styling Approach
- **Tailwind CSS v4 (utility-first)**: Fast iteration, no custom CSS file bloat. Use utility classes for margins, colors, and typography.
- **Shadcn/ui**: Prebuilt React components styled with Tailwind, extended as needed.
- **No CSS preprocessors**: Tailwind covers variables and nesting via its config.

### Theming
- Centralized in `tailwind.config.js` under `theme.extend`, so colors, spacing, and fonts stay in one place.
- Dark mode support via Tailwind’s `media` or `class` strategy (if needed later).

### Visual Style
- **Flat & Modern**: Minimal shadows, solid color blocks, subtle transitions.
- **Glassmorphism (optional)**: Lightly blurred panels can be added for depth, using Tailwind’s `backdrop-blur` classes.

### Color Palette
- **Primary Blue**: #2563EB
- **Accent Blue**: #3B82F6
- **Neutral Light**: #F1F5F9 (background)
- **Neutral Dark**: #475569 (text)
- **Success Green**: #10B981
- **Error Red**: #EF4444
- **Gray Tones**: #E2E8F0, #CBD5E1, #94A3B8  

### Typography
- **Font Family**: ‘Inter’, system-ui, sans-serif  
- **Headings**: Bold, 1.5–2rem  
- **Body**: Normal weight, 1rem–1.125rem  

## 4. Component Structure

- **Atomic Design**:
  - *Atoms*: Buttons, inputs, icons in `/components/atoms`
  - *Molecules*: Form groups, cards in `/components/molecules`
  - *Organisms*: Chat window, contact list in `/components/organisms`
  - *Templates/Pages*: Complete layouts in `/app`

- **Reusability**: Each component accepts props for labels, styles, and event handlers. No hard-coded values.
- **Styling isolation**: Tailwind’s JIT ensures unused styles are purged, and component classes are scoped.

## 5. State Management

- **React Context API**:
  - *AuthContext*: Holds user session, role, and sign-in/sign-out methods. Provided at the root layout (`/app/layout.tsx`).
  - *UIContext* (optional): Manages global UI state like modals or notifications.

- **Data Fetching**:
  - *Next.js Data Fetching*: Use `fetch` in server components (`.tsx` under `/app`) for SSR or static props.
  - *Client-side calls*: SWR or React Query for caching, deduplication, and revalidation when calling `/api` endpoints.

## 6. Routing and Navigation

- **File-based routing (Next.js App Router)**:
  - `/app/page.tsx` → Home/landing  
  - `/app/dashboard/page.tsx` → Agent Dashboard  
  - `/app/admin/dashboard/page.tsx` → Admin Dashboard  
  - `/app/api/…` → API routes

- **Nested layouts**:
  - Common header, sidebar, and footer defined in `/app/layout.tsx` or nested `/dashboard/layout.tsx`.

- **Linking**:
  - Use Next.js `<Link>` component for client-side navigation and prefetching.

- **Protected routes**:
  - Middleware (`middleware.ts`) checks auth cookie and user role, redirecting unauthenticated users to `/login`.

## 7. Performance Optimization

1. **Lazy Loading**: Dynamic import for heavy components (e.g., chat charts) via `next/dynamic`.
2. **Code Splitting**: Out of the box with Next.js App Router.
3. **Image Optimization**: Use `<Image>` with proper width/height and `priority` on critical visuals.
4. **Asset Compression**: Serve gzipped or Brotli assets (handled by Vercel/Next.js by default).
5. **Tailwind Purge**: Unused CSS classes are removed in production builds.
6. **HTTP Caching**: Leverage Next.js headers or platform settings to cache static assets and API responses (e.g., stale-while-revalidate).

## 8. Testing and Quality Assurance

- **Unit Tests (Jest + React Testing Library)**:
  - Test individual UI components for rendering and user interactions.
  - Mock Context providers to isolate logic.

- **Integration Tests**:
  - Combine multiple components and API calls. Example: Test the login flow end-to-end in a Node test environment.

- **End-to-End Tests (Cypress or Playwright)**:
  - Automate real-browser scenarios: signing in, sending a chat message, verifying UI updates.

- **Linting & Formatting**:
  - ESLint with Next.js/TypeScript rules.
  - Prettier for consistent code style.

- **Continuous Integration**:
  - Run tests and lint on every pull request (GitHub Actions or similar).

## 9. Conclusion and Overall Frontend Summary

This frontend guideline outlines a clear, modular, and scalable setup using Next.js, TypeScript, and Tailwind CSS. By following these principles—component-based architecture, utility-first styling, and robust state and routing patterns—you ensure a maintainable codebase that performs well on all devices. Accessibility, responsive design, and a clean white-and-blue theme deliver a user-friendly WhatsApp CMS experience, while testing and performance strategies guarantee reliability and speed as the project grows.