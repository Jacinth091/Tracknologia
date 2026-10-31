import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { getUser, getProviderContext } from "@/features/auth";
import { getInvitationForOnboarding } from "@/features/providers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/(auth)/actions";
import { OnboardingClient } from "./_components/onboarding-client";

export const metadata: Metadata = {
  title: "Provider Setup & Onboarding — Tracknologia",
  description:
    "Set up your Tracknologia Provider profile or join a shop as staff",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/login");
  }

  // If user already has a valid provider membership, go straight to dashboard
  const context = await getProviderContext(supabase);
  if (context) {
    redirect("/dashboard");
  }

  const { invite } = await searchParams;
  const cookieStore = await cookies();
  const cookieInviteToken = cookieStore.get("tracknologia_staff_invite")?.value;

  const userMetadata = user.userMetadata ?? {};
  const intent = userMetadata.intent;
  const providerType = userMetadata.provider_type;
  const inviteToken = invite || cookieInviteToken;
  const initialAccountIntent = inviteToken
    ? "STAFF"
    : intent === "SHOP" || intent === "INDEPENDENT" || intent === "STAFF"
      ? intent
      : providerType === "SHOP" || providerType === "INDEPENDENT"
        ? providerType
        : undefined;
  const initialDisplayName =
    typeof userMetadata.display_name === "string"
      ? userMetadata.display_name
      : undefined;
  const initialEmail = user.email || undefined;

  // If staff invitation token is present, resolve the Shop information
  let shopDetails = null;
  if (inviteToken) {
    shopDetails = await getInvitationForOnboarding(inviteToken, supabase);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="shrink-0 rounded-sm">
            <BrandLogo />
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <OnboardingClient
          defaultInviteToken={inviteToken}
          initialAccountIntent={initialAccountIntent}
          initialDisplayName={initialDisplayName}
          initialEmail={initialEmail}
          shopDetails={shopDetails}
        />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          How we use your information:{" "}
          <Link
            href="/privacy"
            className="text-foreground underline underline-offset-4"
          >
            Privacy notice
          </Link>
        </p>
      </main>
    </div>
  );
}
