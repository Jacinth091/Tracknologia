import { BrandLogo } from "@/components/shared/brand-logo";
import {
  getUser,
  getProviderContext,
  AuthError,
  type AuthenticatedUser,
  type ProviderContext,
} from "@/features/auth";
import { signOutAction } from "@/app/(auth)/actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { ProviderNav } from "./_components/provider-nav";
import { ServiceUnavailable } from "./_components/service-unavailable";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: AuthenticatedUser | null = null;
  let context: ProviderContext | null = null;

  try {
    user = await getUser();
    if (user) {
      context = await getProviderContext();
    }
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "INFRASTRUCTURE_FAILURE") {
        return <ServiceUnavailable />;
      }

      if (err.code === "AMBIGUOUS_PROVIDER_CONTEXT") {
        return (
          <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
            <div className="max-w-md w-full p-6 border border-border rounded-lg shadow-xs bg-card space-y-4 text-center">
              <h2 className="text-xl font-bold text-foreground">
                Multiple Provider Accounts Found
              </h2>
              <p className="text-sm text-muted-foreground">
                Your account is associated with multiple provider profiles.
                Multi-provider switching is currently restricted. Please contact
                support or your workshop administrator.
              </p>
              <div className="pt-2 flex justify-center">
                <form action={signOutAction}>
                  <Button variant="outline" size="sm" type="submit">
                    Sign Out
                  </Button>
                </form>
              </div>
            </div>
          </div>
        );
      }
    }
    throw err;
  }

  if (!user) {
    redirect("/login");
  }

  if (!context) {
    redirect("/onboarding");
  }

  const roleDisplay =
    context.providerType === "INDEPENDENT"
      ? "Independent Repairer"
      : context.role === "OWNER"
        ? "Shop Owner"
        : "Staff";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex min-h-18 items-center justify-between gap-4 py-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/dashboard" className="shrink-0 rounded-sm">
                <BrandLogo />
              </Link>
              <div className="min-w-0 border-border sm:border-l sm:pl-6">
                <p className="max-w-64 truncate text-sm font-semibold">
                  {context.providerName}
                </p>
                <p className="text-xs text-muted-foreground">{roleDisplay}</p>
              </div>
            </div>
            <form action={signOutAction}>
              <Button variant="outline" type="submit">
                Sign Out
              </Button>
            </form>
          </div>
          <ProviderNav isShop={context.providerType === "SHOP"} />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
