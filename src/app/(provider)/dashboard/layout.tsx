import { BrandLogo } from "@/components/shared/brand-logo";
import {
  getUser,
  getProviderContext,
  AuthError,
  type AuthenticatedUser,
  type ProviderContext,
} from "@/features/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { requireInternalOperator } from "@/features/internal-operations";
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
    // Internal operators hold a login with no Provider; send them to /internal
    // instead of Provider onboarding; other outcomes still go to onboarding.
    const access = await requireInternalOperator();
    if (access.status === "ALLOWED") {
      redirect("/internal");
    }
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
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" className="shrink-0 rounded-sm">
            <BrandLogo />
          </Link>
          <ProviderNav
            isShop={context.providerType === "SHOP"}
            providerName={context.providerName}
            roleLabel={roleDisplay}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
