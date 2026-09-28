import Link from 'next/link';

export default function CheckEmailPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
      <p className="text-sm text-muted-foreground">
        We sent you a sign-in link. It expires in 24 hours.
        {process.env.NODE_ENV !== 'production' && ' (Local dev: the link is printed in the web server console.)'}
      </p>
      <Link href="/login" className="text-sm font-medium underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
