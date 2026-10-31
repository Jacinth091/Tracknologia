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
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle>
          <h1 className="text-2xl font-bold tracking-tight">
            Create your account
          </h1>
        </CardTitle>
        <CardDescription>
          Choose how you&apos;ll use Tracknologia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm initialInvite={invite} />
      </CardContent>
      <CardFooter className="justify-center border-t border-border/50 pt-4 text-sm text-muted-foreground">
        <span>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
          {" · "}
          <Link
            href="/privacy"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Privacy
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
