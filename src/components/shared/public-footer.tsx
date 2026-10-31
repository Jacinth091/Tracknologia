import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";

// The one footer for public pages: the dark brand footer from the home page.
// It carries no session state, unlike PublicHeader.
export function PublicFooter() {
  return (
    <footer className="bg-foreground py-8 text-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-3">
          <BrandLogo className="text-background" />
          <p className="text-xs text-background/70">
            Tracknologia &copy; {new Date().getFullYear()}
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex gap-6 text-sm">
          <Link href="/track" className="underline-offset-4 hover:underline">
            Track
          </Link>
          <Link href="/feedback" className="underline-offset-4 hover:underline">
            Send feedback
          </Link>
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy
          </Link>
          <Link href="/login" className="underline-offset-4 hover:underline">
            Sign In
          </Link>
        </nav>
      </div>
    </footer>
  );
}
