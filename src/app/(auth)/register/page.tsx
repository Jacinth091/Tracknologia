import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegisterForm } from "../_components/register-form";

export const metadata: Metadata = {
  title: "Get Started — Tracknologia",
  description:
    "Create your Tracknologia account as an Independent repairer, Shop Owner, or Shop Staff",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="text-center space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Get Started with Tracknologia
        </CardTitle>
        <CardDescription className="text-sm">
          Select what you are signing up as to create your account
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
