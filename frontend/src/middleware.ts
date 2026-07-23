import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    
    // Check with the backend
    const verifyUrl = 'http://127.0.0.1:4000/api/auth/verify';
    
    const res = await fetch(verifyUrl, {
      headers: token ? { Cookie: `token=${token}` } : {},
      cache: 'no-store'
    });
    
    if (res.ok) {
      const data = await res.json();
      
      if (data.requiresSetup) {
        return NextResponse.redirect(new URL('/setup', request.url));
      }
      
      if (!data.authenticated) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      
      return NextResponse.next();
    }
  } catch (error) {
    // If backend is unreachable, allow passthrough so we don't get infinite redirect loops
    // The frontend data fetches will fail and show appropriate errors anyway.
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login|setup).*)'],
};
