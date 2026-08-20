import type { Metadata } from "next";
import { requireProviderContext } from "@/features/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard Overview — Tracknologia",
  description: "Manage repair jobs, customer intake, and operations",
};

export default async function DashboardPage() {
  const context = await requireProviderContext();

  const providerTypeLabel =
    context.providerType === "INDEPENDENT"
      ? "Independent Technician"
      : "Repair Shop";

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
            {context.providerName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>{context.email}</span>
            <span>•</span>
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {providerTypeLabel}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/repairs/new"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            + New Repair
          </Link>
        </div>
      </div>

      {/* Auth Context Verification Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-primary font-semibold">
            Feature 01: Auth & Provider Authorization Active
          </CardTitle>
          <CardDescription>
            Your session has been validated and resolved into a trusted Provider Context.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs font-mono text-muted-foreground space-y-1">
          <p>Provider: {context.providerName} ({context.providerType})</p>
          <p>User ID: {context.userId}</p>
          <p>Provider ID: {context.providerId}</p>
        </CardContent>
      </Card>

      {/* Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider">
              Active Repairs
            </CardDescription>
            <CardTitle className="text-2xl font-bold">0</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            In progress across all devices
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider">
              Waiting for Parts
            </CardDescription>
            <CardTitle className="text-2xl font-bold">0</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Awaiting supplier delivery
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider">
              Ready for Pickup
            </CardDescription>
            <CardTitle className="text-2xl font-bold">0</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Completed, awaiting customer
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider">
              Pending Requests
            </CardDescription>
            <CardTitle className="text-2xl font-bold">0</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Customer intake awaiting review
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
