// Redirects signed-out visitors to /login. Pages and API handlers still verify the
// session themselves (lib/auth.ts) — this is only the cheap first gate.
import { withAuth } from 'next-auth/middleware';

export default withAuth({ pages: { signIn: '/login' } });

export const config = {
  matcher: ['/dashboard/:path*', '/workspace/:path*'],
};
