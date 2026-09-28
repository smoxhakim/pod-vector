import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <p className="mb-6 text-sm font-semibold tracking-tight">POD Vector Studio</p>
        {children}
      </div>
    </main>
  );
}
