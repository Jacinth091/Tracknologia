import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Ensures a redirect target is a safe internal relative path (e.g. "/dashboard").
 * Strictly rejects protocol-relative URLs ("//evil.com"), backslash tricks ("/\evil.com"),
 * absolute URLs ("https://..."), or javascript: schemes.
 */
export function getSafeInternalRedirectUrl(
  url: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!url || typeof url !== "string") {
    return fallback;
  }

  const trimmed = url.trim();
  // Must start with a single "/" and NOT followed by another "/" or "\"
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Reject URL scheme syntax
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

