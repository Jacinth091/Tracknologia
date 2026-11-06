// Client-safe hint, not a gate: it reads text already in the browser, sends
// nothing anywhere, and never blocks a submission. Device text such as
// "iPhone 15", years, quantities and 15-digit IMEIs without a "+" or "09"
// prefix is deliberately not matched.

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
// Philippine mobile: 09XX XXX XXXX or +63 9XX XXX XXXX, separators optional.
const PH_MOBILE = /(?:\+63[\s.-]?|\b0)9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/;
// International: a "+" followed by 9 or more digits, separators optional.
const INTERNATIONAL = /\+(?:\d[\s.-]?){8,}\d/;

// Only the first 4000 characters are checked (the server caps the message at
// 2000), so a pasted huge token cannot make the per-keystroke check expensive.
export function looksLikeContactDetails(text: string): boolean {
  const sample = text.slice(0, 4000);
  return (
    EMAIL.test(sample) || PH_MOBILE.test(sample) || INTERNATIONAL.test(sample)
  );
}
