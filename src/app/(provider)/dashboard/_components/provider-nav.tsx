"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProviderNav({ isShop }: { isShop: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/requests", label: "Requests" },
    { href: "/dashboard/repairs", label: "Repairs" },
    ...(isShop ? [{ href: "/dashboard/team", label: "Team & Staff" }] : []),
    { href: "/dashboard/settings", label: "Settings" },
  ];

  return (
    <nav aria-label="Provider navigation" className="flex flex-wrap gap-1 py-2">
      {links.map(({ href, label }) => {
        const active =
          pathname === href ||
          (href !== "/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
