import type { Metadata } from "next";
import Link from "next/link";
import { requireProviderContext } from "@/features/auth";
import { getRepairCounts } from "@/features/repairs";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard — Tracknologia",
  description: "Provider Dashboard Overview",
};

export default async function DashboardPage() {
  const [context, repairCounts] = await Promise.all([
    requireProviderContext(),
    getRepairCounts(),
  ]);

  const providerTypeLabel =
    context.providerType === "INDEPENDENT"
      ? "Independent Repairer"
      : "Repair Shop";

  return (
    <div className="max-w-6xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground wrap-anywhere">
            {context.providerName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span className="wrap-anywhere">{context.email}</span>
            <span>•</span>
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-foreground">
              {providerTypeLabel}
            </span>
          </p>
        </div>
        <Link
          href="/dashboard/repairs/new"
          className={cn(buttonVariants(), "min-h-11 w-full sm:w-auto")}
        >
          Create Repair
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Active",
            count: repairCounts.active,
            href: "/dashboard/repairs?status=IN_PROGRESS",
          },
          {
            label: "Waiting",
            count: repairCounts.waiting,
            href: "/dashboard/repairs?status=WAITING",
          },
          {
            label: "Ready",
            count: repairCounts.ready,
            href: "/dashboard/repairs?status=READY",
          },
          {
            label: "Completed",
            count: repairCounts.completed,
            href: "/dashboard/repairs?status=COMPLETED",
          },
        ].map((item) => (
          <Link key={item.label} href={item.href}>
            <Card className="h-full transition-colors hover:border-input">
              <CardHeader className="p-4 sm:p-6">
                <CardDescription>{item.label} Repairs</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {item.count}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Keep work moving
          </CardTitle>
          <CardDescription>
            Review new requests or update the repairs already in your care.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/dashboard/repairs"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full sm:w-fit",
              )}
            >
              Open Repairs
            </Link>
            <Link
              href="/dashboard/requests"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "w-full sm:w-fit",
              )}
            >
              Review Requests
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
