import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { PublicFooter } from "@/components/shared/public-footer";
import { PublicRecoveryPanel } from "@/components/shared/public-recovery-panel";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Keep 404 recovery independent of request cookies and authentication. */}
      <header className="border-b border-border bg-card">
        <nav
          className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
          aria-label="Recovery navigation"
        >
          <Link href="/" className="shrink-0 rounded-sm">
            <BrandLogo />
          </Link>
          <Link
            href="/track"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Track a repair
          </Link>
        </nav>
      </header>
      <main className="flex flex-1 items-center px-4 py-10 sm:px-6 sm:py-16">
        <PublicRecoveryPanel kind="not-found" />
      </main>
      <PublicFooter />
    </div>
  );
}
