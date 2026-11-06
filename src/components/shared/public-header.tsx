import { cookies } from "next/headers";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Presentation only: a stale cookie just leads to /dashboard, which re-checks
// auth (operators continue to /internal).
async function hasSupabaseSession() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("auth-token"));
}

// The one header for public pages. The home page's header is the standard;
// extra links (such as the home page's provider anchor) hide below `sm`.
export async function PublicHeader({
  current,
  extraLinks = [],
}: {
  current?: "track";
  extraLinks?: { href: string; label: string }[];
}) {
  const signedIn = await hasSupabaseSession();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={signedIn ? "/dashboard" : "/"}
          className="shrink-0 rounded-sm"
        >
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
          {signedIn ? (
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
