'use server';

import { prisma } from '@pod-vector-studio/db';
import bcrypt from 'bcryptjs';
import { normalizeEmail } from '@/lib/auth';

const MIN_PASSWORD_LENGTH = 8;

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (input.password.length < MIN_PASSWORD_LENGTH)
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { error: 'An account with this email already exists. Sign in instead.' };

  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.user.create({ data: { email, name, passwordHash } });
  return {};
}
