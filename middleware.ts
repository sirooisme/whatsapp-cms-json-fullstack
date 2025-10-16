import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/sign-in',
    '/sign-up',
    '/api/auth',
    '/api/health',
    '/favicon.ico',
    '/_next',
    '/static'
  ];

  // Define admin-only routes
  const adminRoutes = [
    '/admin',
    '/admin/',
    '/dashboard/admin',
    '/api/cms/users'
  ];

  // Check if the path is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route)
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check if the path requires admin access
  const isAdminRoute = adminRoutes.some(route => 
    pathname === route || pathname.startsWith(route)
  );

  try {
    // Get the session
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session || !session.user) {
      // Redirect to sign-in for protected routes
      if (pathname.startsWith('/api/')) {
        // For API routes, return 401
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      } else {
        // For page routes, redirect to sign-in
        const signInUrl = new URL('/sign-in', request.url);
        signInUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(signInUrl);
      }
    }

    // For admin routes, check if user has admin role
    if (isAdminRoute) {
      // We need to get the user's role from our database
      const { jsonDb } = await import('@/lib/json-db');
      const user = await jsonDb.getUserById(session.user.id!);
      
      if (!user || user.role !== 'admin') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          );
        } else {
          // Redirect to dashboard with error
          const dashboardUrl = new URL('/dashboard', request.url);
          dashboardUrl.searchParams.set('error', 'admin_required');
          return NextResponse.redirect(dashboardUrl);
        }
      }
    }

    // Add user info to headers for downstream use
    const response = NextResponse.next();
    response.headers.set('x-user-id', session.user.id!);
    response.headers.set('x-user-email', session.user.email!);
    
    // Add role from database
    const { jsonDb } = await import('@/lib/json-db');
    const user = await jsonDb.getUserById(session.user.id!);
    if (user) {
      response.headers.set('x-user-role', user.role);
    }

    return response;
  } catch (error) {
    console.error('Middleware error:', error);
    
    // For API routes, return error
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication error' },
        { status: 500 }
      );
    } else {
      // For page routes, redirect to sign-in
      const signInUrl = new URL('/sign-in', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};