import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Technical input bound for a single return destination. */
const MAX_INTERNAL_REDIRECT_LENGTH = 2048;

/**
 * Ensures a redirect target is a safe internal relative path (e.g. "/dashboard").
 *
 * Only single-leading-slash local paths are accepted, so absolute URLs
 * ("https://...", "javascript:...") and protocol-relative targets
 * ("//evil.com") fall back. Any backslash or C0 control/DEL character falls
 * back as well, because a URL parser can otherwise normalize those into an
 * external authority ("/\evil.com", "/\t/evil.com"). Boundary whitespace is
 * trimmed; query strings and fragments are preserved.
 */
export function getSafeInternalRedirectUrl(
  url: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!url || typeof url !== "string") {
    return fallback;
  }

  const trimmed = url.trim();

  if (trimmed.length > MAX_INTERNAL_REDIRECT_LENGTH) {
    return fallback;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  if (/[\\\u0000-\u001f\u007f]/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}
