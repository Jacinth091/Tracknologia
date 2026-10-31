/**
 * Masks an account email for display: the first character of the local part,
 * then bullets, then the full domain (`b•••@example.com`). Used so the reset
 * page can name the account without echoing the full address back.
 */
export function maskEmail(email: string | null | undefined): string {
  const at = email?.lastIndexOf("@") ?? -1;
  if (!email || at <= 0) {
    return "your account";
  }

  return `${email.charAt(0)}•••${email.slice(at)}`;
}
