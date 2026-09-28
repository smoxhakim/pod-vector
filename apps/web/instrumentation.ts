// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { storageConfigHint, storageConfigProblem } = await import('@pod-vector-studio/shared/storage');
  const problem = storageConfigProblem();
  if (problem) console.warn(`\n⚠️  ${storageConfigHint(problem)}\n   Uploads, previews and exports will fail until this is fixed.\n`);
}
