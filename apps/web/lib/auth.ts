import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@pod-vector-studio/db';
import bcrypt from 'bcryptjs';
import { getServerSession, type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { EmailConfig } from 'next-auth/providers/email';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Magic-link provider defined inline (instead of EmailProvider) so we don't pull in
// nodemailer. Links are logged to the console until Resend is wired up.
const magicLink: EmailConfig = {
  id: 'email',
  type: 'email',
  name: 'Email',
  server: {},
  from: 'POD Vector Studio <no-reply@podvector.studio>',
  maxAge: 24 * 60 * 60,
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    if (process.env.NODE_ENV === 'production') {
      // TODO: send via Resend (RESEND_API_KEY). Never log live sign-in links in production.
      throw new Error('Magic-link email delivery is not configured');
    }
    console.log(`\n[auth] Magic link for ${identifier}:\n${url}\n`);
  },
};

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  // Credentials sign-in only works with JWT sessions in NextAuth v4.
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login/check-email',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({ where: { email: normalizeEmail(credentials.email) } });
        if (!user?.passwordHash) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        return valid ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
    magicLink,
  ],
  callbacks: {
    async signIn({ user, account, email }) {
      // Completing a magic link proves inbox ownership. If a password was set on this
      // address before it was ever verified, it may belong to someone else — drop it.
      if (account?.provider === 'email' && !email?.verificationRequest && user.email) {
        await prisma.user.updateMany({
          where: { email: user.email, emailVerified: null, passwordHash: { not: null } },
          data: { passwordHash: null },
        });
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};

/** Session user id, or null. For route handlers and server components. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

/** Server components/pages: the signed-in user, redirecting to /login otherwise. */
export async function requireUser() {
  const userId = await getSessionUserId();
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user) redirect('/login');
  return user;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
