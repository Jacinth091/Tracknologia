import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { requireInternalOperator } from "@/features/internal-operations";
import { InternalNav } from "./_components/internal-nav";
import { InternalServiceUnavailable } from "./_components/internal-service-unavailable";

// Private, per-request surface: never cache or index internal pages.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Internal Operations — Tracknologia",
  robots: { index: false, follow: false },
};

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireInternalOperator();

  if (access.status === "UNAUTHENTICATED") {
    redirect("/login?redirectTo=%2Finternal");
  }

  if (access.status === "FORBIDDEN") {
    notFound();
  }

  if (access.status === "UNAVAILABLE") {
    return <InternalServiceUnavailable />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <Link href="/internal" className="shrink-0 rounded-sm">
            <BrandLogo />
          </Link>
          <InternalNav />
          <form action={signOutAction} className="shrink-0">
            <Button variant="outline" size="sm" type="submit">
              Sign Out
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
