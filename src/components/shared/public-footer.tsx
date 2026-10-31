import Link from "next/link";

// The one footer for public pages. Links are the public routes a visitor
// might need next; it carries no session state, unlike PublicHeader.
export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <nav
        aria-label="Footer"
        className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6"
      >
        <p>© 2026 Tracknologia</p>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link
            href="/privacy"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Privacy
          </Link>
          <Link
            href="/feedback"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Send feedback
          </Link>
          <Link
            href="/track"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Track a repair
          </Link>
        </div>
      </nav>
    </footer>
  );
}
