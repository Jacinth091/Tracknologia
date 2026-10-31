"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/internal", label: "Overview" },
  { href: "/internal/feedback", label: "Feedback" },
  { href: "/internal/activity", label: "Activity" },
];

export function InternalNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Internal navigation"
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
    >
      {LINKS.map(({ href, label }) => {
        const active =
          pathname === href ||
          (href !== "/internal" && pathname.startsWith(`${href}/`));

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex shrink-0 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "text-foreground after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
