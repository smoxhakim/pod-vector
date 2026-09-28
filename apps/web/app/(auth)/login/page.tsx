import { LoginForm } from './login-form';

const ERRORS: Record<string, string> = {
  CredentialsSignin: 'Incorrect email or password.',
  Verification: 'That sign-in link is invalid or has expired. Request a new one.',
  EmailSignin: 'Could not send the sign-in link. Try again.',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? 'Sign-in failed. Try again.') : undefined;
  return <LoginForm callbackUrl={searchParams.callbackUrl} initialError={error} />;
}
