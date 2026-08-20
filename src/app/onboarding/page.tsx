import type { Metadata } from "next";
import { getUser, getProviderContext } from "@/features/auth";
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
  const initialEmail = user.email || undefined;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-xl shadow-md">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            Provider Setup & Onboarding
          </CardTitle>
          <CardDescription>
            Choose your operating model to set up your profile or join as shop staff
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingClient
            defaultInviteToken={invite}
            initialEmail={initialEmail}
          />
        </CardContent>
      </Card>
    </div>
  );
}
