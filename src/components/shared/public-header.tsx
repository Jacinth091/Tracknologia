import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The one header for public pages. The home page's header is the standard;
// extra links (such as the home page's provider anchor) hide below `sm`.
export function PublicHeader({
  current,
  extraLinks = [],
}: {
  current?: "track";
  extraLinks?: { href: string; label: string }[];
}) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-sm">
          <BrandLogo />
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex items-center gap-1 sm:gap-4"
        >
          {extraLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hidden px-2 py-3 text-sm font-medium underline-offset-4 hover:underline sm:inline-flex"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/track"
            aria-current={current === "track" ? "page" : undefined}
            className={cn(
              "px-2 py-3 text-sm font-medium underline-offset-4 hover:underline",
              current === "track" && "underline",
            )}
          >
            Track a repair
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}
