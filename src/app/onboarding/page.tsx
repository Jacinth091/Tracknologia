import type { Metadata } from "next";
import { getUser, getProviderContext } from "@/features/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingClient } from "./_components/onboarding-client";

export const metadata: Metadata = {
  title: "Provider Onboarding — Tracknologia",
  description: "Set up your Tracknologia Provider profile or join a shop as staff",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  // If user already has a valid provider membership, go straight to dashboard
  const context = await getProviderContext();
  if (context) {
    redirect("/dashboard");
  }

  const { invite } = await searchParams;

  const initialProviderType = (user.userMetadata?.provider_type as "SHOP" | "INDEPENDENT") || undefined;
  const initialDisplayName = (user.userMetadata?.display_name as string) || undefined;
  const initialEmail = user.email || undefined;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-xl shadow-md">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-xl sm:text-2xl">Complete Provider Onboarding</CardTitle>
          <CardDescription>
            {initialProviderType === "SHOP"
              ? "Set up your repair shop details to start receiving and managing repairs"
              : initialProviderType === "INDEPENDENT"
                ? "Set up your independent repair profile to start tracking repairs"
                : "Choose your operating model or accept an owner invitation to get started"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingClient
            defaultInviteToken={invite}
            initialProviderType={initialProviderType}
            initialDisplayName={initialDisplayName}
            initialEmail={initialEmail}
          />
        </CardContent>
      </Card>
    </div>
  );
}
