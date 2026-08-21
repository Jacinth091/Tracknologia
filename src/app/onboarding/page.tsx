import type { Metadata } from "next";
import { getUser, getProviderContext } from "@/features/auth";
import { getInvitationForOnboarding } from "@/features/providers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingClient } from "./_components/onboarding-client";

export const metadata: Metadata = {
  title: "Provider Setup & Onboarding — Tracknologia",
  description: "Set up your Tracknologia Provider profile or join a shop as staff",
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

  const userMetadata = user.userMetadata ?? {};
  const intent = userMetadata.intent as "INDEPENDENT" | "SHOP" | "STAFF" | undefined;
  const providerType =
    (userMetadata.provider_type as "INDEPENDENT" | "SHOP" | undefined) ??
    (intent === "SHOP" ? "SHOP" : intent === "INDEPENDENT" ? "INDEPENDENT" : undefined);
  const inviteToken = (userMetadata.invite_token as string | undefined) ?? invite;
  const initialDisplayName = (userMetadata.display_name as string | undefined) ?? undefined;
  const initialEmail = user.email || undefined;

  // If staff invitation token is present, resolve the Shop information
  let shopDetails = null;
  if (inviteToken) {
    shopDetails = await getInvitationForOnboarding(inviteToken, supabase);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-xl shadow-md">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            {providerType === "SHOP"
              ? "Set Up Your Repair Shop"
              : providerType === "INDEPENDENT"
                ? "Set Up Your Independent Profile"
                : shopDetails || intent === "STAFF" || inviteToken
                  ? "Complete Staff Profile"
                  : "Provider Setup & Onboarding"}
          </CardTitle>
          <CardDescription>
            {providerType === "SHOP"
              ? "Configure your shop details and storefront location to get started"
              : providerType === "INDEPENDENT"
                ? "Configure your repair brand and service area to get started"
                : shopDetails
                  ? `Join ${shopDetails.shopName} as shop staff`
                  : intent === "STAFF" || inviteToken
                    ? "Complete your staff profile to connect to your repair shop"
                    : "Choose your operating model to set up your profile or join as shop staff"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingClient
            defaultInviteToken={inviteToken}
            initialProviderType={providerType}
            initialDisplayName={initialDisplayName}
            initialEmail={initialEmail}
            shopDetails={shopDetails}
          />
        </CardContent>
      </Card>
    </div>
  );
}

