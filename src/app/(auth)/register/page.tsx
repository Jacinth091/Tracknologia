import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "../_components/register-form";

export const metadata: Metadata = {
  title: "Register Provider — Tracknologia",
  description: "Create your Tracknologia Provider account",
};

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Provider Account</CardTitle>
        <CardDescription>
          Get started with modern repair intake, tracking, and operations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
      <CardFooter className="flex-col gap-2 justify-center border-t border-border/50 pt-4 text-xs text-muted-foreground text-center">
        <p>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
        <p className="text-[11px] text-muted-foreground/80">
          Joining as Shop Staff? Use the invitation link sent by your Shop Owner.
        </p>
      </CardFooter>
    </Card>
  );
}
