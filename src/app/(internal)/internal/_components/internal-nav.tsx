"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon } from "@hugeicons/core-free-icons";
import { signOutAction } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function InternalNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { href: "/internal", label: "Overview" },
    { href: "/internal/feedback", label: "Feedback" },
    { href: "/internal/activity", label: "Activity" },
  ].map((link) => ({
    ...link,
    active:
      pathname === link.href ||
      (link.href !== "/internal" && pathname.startsWith(`${link.href}/`)),
  }));

  return (
    <>
      <nav
        aria-label="Internal navigation"
        className="hidden items-center gap-1 md:flex"
      >
        {links.map(({ href, label, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "text-foreground after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden min-w-0 text-right sm:block">
          <p className="max-w-48 truncate text-sm font-semibold">
            Internal operations
          </p>
          <p className="text-xs text-muted-foreground">Operator</p>
        </div>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              />
            }
          >
            <HugeiconsIcon icon={Menu01Icon} aria-hidden="true" />
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <nav
              aria-label="Internal navigation"
              className="flex flex-col gap-1 px-4 pb-6"
            >
              {links.map(({ href, label, active }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center rounded-xl px-3 text-base font-medium transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Avatar>
              <AvatarFallback>IO</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <span className="block truncate text-sm font-semibold text-foreground">
                  Internal operations
                </span>
                <span className="block text-xs">Operator</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/privacy" />}>
              Privacy notice
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              nativeButton
              render={<button type="submit" form="internal-sign-out" />}
            >
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <form id="internal-sign-out" action={signOutAction} className="hidden" />
    </>
  );
}
