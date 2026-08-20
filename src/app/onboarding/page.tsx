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

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl sm:text-2xl">Provider Setup & Onboarding</CardTitle>
          <CardDescription>
            Choose your provider operating model or accept an owner invitation to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingClient defaultInviteToken={invite} />
        </CardContent>
      </Card>
    </div>
  );
}
