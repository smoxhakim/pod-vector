'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeCallbackUrl } from '@/lib/safe-redirect';

export function LoginForm({ callbackUrl, initialError }: { callbackUrl?: string; initialError?: string }) {
  const router = useRouter();
  const destination = safeCallbackUrl(callbackUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState<'password' | 'link' | null>(null);

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPending('password');
    setError(undefined);
    const res = await signIn('credentials', { email, password, redirect: false });
    setPending(null);
    if (res?.ok) {
      router.push(destination);
      router.refresh();
    } else {
      setError('Incorrect email or password.');
    }
  }

  async function onMagicLink() {
    if (!email) {
      setError('Enter your email to receive a sign-in link.');
      return;
    }
    setPending('link');
    setError(undefined);
    const res = await signIn('email', { email, callbackUrl: destination, redirect: false });
    setPending(null);
    if (res?.ok) router.push('/login/check-email');
    else setError('Could not send the sign-in link. Try again.');
  }

  return (
    <form onSubmit={onPasswordSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your password or get a one-time sign-in link.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending !== null || !password}>
        {pending === 'password' ? 'Signing in…' : 'Sign in'}
      </Button>
      <Button type="button" variant="outline" className="w-full" disabled={pending !== null} onClick={onMagicLink}>
        {pending === 'link' ? 'Sending link…' : 'Email me a sign-in link'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
