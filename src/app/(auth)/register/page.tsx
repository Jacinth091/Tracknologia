import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "../_components/register-form";

export const metadata: Metadata = {
  title: "Create Account — Tracknologia",
  description: "Create your Tracknologia account to get started",
};

export default function RegisterPage() {
  return (
    <Card className="w-full shadow-md">
      <CardHeader className="text-center space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold tracking-tight">Create Account</CardTitle>
        <CardDescription className="text-sm">
          Sign up with your email to get started with Tracknologia
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
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
