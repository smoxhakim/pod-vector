/**
 * An error whose message is safe and useful to show the user (bad input, unsupported
 * option). Any other error is reported as a generic failure and only logged.
 */
export class JobError extends Error {
  override name = 'JobError';
}
