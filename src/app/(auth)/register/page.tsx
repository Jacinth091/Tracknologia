import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "../_components/register-form";

export const metadata: Metadata = {
  title: "Get Started — Tracknologia",
  description: "Set up your Independent repair business, Repair Shop, or join as Shop Staff",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;

  return (
    <Card className="w-full max-w-xl mx-auto shadow-md">
      <CardHeader className="text-center space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold tracking-tight">Get Started with Tracknologia</CardTitle>
        <CardDescription className="text-sm">
          Modern repair tracking and operations for shops and independent repairers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm initialInvite={invite} />
      </CardContent>
      <CardFooter className="justify-center border-t border-border/50 pt-4 text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
