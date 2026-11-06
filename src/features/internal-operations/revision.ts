/**
 * Deploy revision when the environment supplies a real SHA. Other environment
 * text is never echoed into operator pages or exports.
 */
export function deploymentRevision(): string | null {
  const raw =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.APP_REVISION?.trim() ||
    "";
  return /^[0-9a-f]{7,40}$/i.test(raw) ? raw : null;
}
