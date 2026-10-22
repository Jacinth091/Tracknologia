import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProviderContext } from "@/features/auth";
import { getProviderServiceModes } from "@/features/providers";
import {
  getAllowedRepairStatusTransitions,
  getRepair,
} from "@/features/repairs";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

import {
  RepairStatusBadge,
  repairStatusLabel,
} from "../_components/repair-status-badge";
import {
  RepairDetailForms,
  RepairLifecycleActions,
} from "./_components/repair-detail-forms";

export const metadata: Metadata = {
  title: "Repair Details — Tracknologia",
  description: "Manage Repair details and lifecycle",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function DetailValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-foreground",
          mono && "font-mono font-semibold",
        )}
      >
        {value || "Not provided"}
      </dd>
    </div>
  );
}

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ repairId: string }>;
}) {
  const { repairId } = await params;
  const supabase = await createClient();
  const context = await requireProviderContext(supabase);
  const [repair, serviceModes] = await Promise.all([
    getRepair(repairId, supabase),
    getProviderServiceModes(context.providerId, supabase),
  ]);
  if (!repair) {
    notFound();
  }

  const deviceName =
    [repair.brand, repair.model].filter(Boolean).join(" ") || repair.deviceType;
  const allowedTransitions = getAllowedRepairStatusTransitions(
    repair.currentStatus,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="min-w-0">
        <Link
          href="/dashboard/repairs"
          className={cn(
            buttonVariants({ variant: "link", size: "sm" }),
            "-ml-3 mb-1",
          )}
        >
          ← Back to Repairs
        </Link>
        <p className="font-mono text-xs text-muted-foreground">
          {repair.ticketNumber}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight wrap-anywhere sm:text-3xl">
          {deviceName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground wrap-anywhere">
          {repair.customerName} · Updated {formatDate(repair.updatedAt)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Repair identity</CardTitle>
              <CardDescription>
                Use the ticket number within your team. Share the Tracking Code
                with the customer for repair updates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <DetailValue
                  label="Origin"
                  value={
                    repair.origin === "CUSTOMER_REQUEST"
                      ? "Customer Request"
                      : "Provider-created"
                  }
                />
                <DetailValue
                  label="Created"
                  value={formatDate(repair.createdAt)}
                />
              </dl>
              {repair.repairRequestId ? (
                <Link
                  href={`/dashboard/requests/${repair.repairRequestId}`}
                  className={cn(
                    buttonVariants({ variant: "link", size: "sm" }),
                    "-ml-3 mt-3",
                  )}
                >
                  Open source Repair Request
                </Link>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Customer and Device Snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-5 sm:grid-cols-2">
                  <DetailValue label="Customer" value={repair.customerName} />
                  <DetailValue label="Phone" value={repair.customerPhone} />
                  <DetailValue label="Email" value={repair.customerEmail} />
                  <DetailValue label="Device type" value={repair.deviceType} />
                  <DetailValue label="Brand" value={repair.brand} />
                  <DetailValue label="Model" value={repair.model} />
                  <DetailValue
                    label="Serial number"
                    value={repair.serialNumber}
                  />
                  <DetailValue
                    label="Color / variant"
                    value={repair.colorVariant}
                  />
                  <DetailValue
                    label="Specifications"
                    value={repair.deviceSpecs}
                  />
                  <DetailValue
                    label="Physical condition"
                    value={repair.physicalCondition}
                  />
                  <DetailValue
                    label="Accessories received"
                    value={repair.accessoriesReceived}
                  />
                  <DetailValue
                    label="Service Mode"
                    value={
                      repair.serviceMode
                        ? repair.serviceMode.replaceAll("_", " ")
                        : null
                    }
                  />
                  <DetailValue
                    label="Arrangement details"
                    value={repair.serviceModeDetails}
                  />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Provider work information</CardTitle>
                <CardDescription>
                  Internal Notes are Provider-private. Customer Updates are the
                  intentionally customer-visible channel.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-5">
                  <DetailValue
                    label="Reported Problem"
                    value={repair.reportedProblem}
                  />
                  <DetailValue
                    label="Initial observation"
                    value={repair.initialObservation}
                  />
                  <DetailValue label="Diagnosis" value={repair.diagnosis} />
                  <DetailValue
                    label="Internal Notes — private"
                    value={repair.internalNotes}
                  />
                </dl>
              </CardContent>
            </Card>
          </div>

          <RepairDetailForms repair={repair} serviceModes={serviceModes} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Customer Updates</CardTitle>
                <CardDescription>
                  Customer-visible progress messages independent of status
                  changes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {repair.customerUpdates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Customer Updates yet.
                  </p>
                ) : (
                  <ol className="space-y-4">
                    {repair.customerUpdates.map((update) => (
                      <li
                        key={update.id}
                        className="border-l-2 border-primary/30 pl-4"
                      >
                        <p className="whitespace-pre-wrap text-sm">
                          {update.message}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(update.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lifecycle history</CardTitle>
                <CardDescription>
                  Append-only Status Events for meaningful operational changes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  {repair.statusEvents.map((event) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-border pl-4"
                    >
                      <p className="text-sm font-medium">
                        {event.fromStatus
                          ? `${repairStatusLabel(event.fromStatus)} → `
                          : "Created → "}
                        {repairStatusLabel(event.toStatus)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(event.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
                {repair.completedAt ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Completed {formatDate(repair.completedAt)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle>Repair status</CardTitle>
              <CardDescription>
                Choose the status that reflects what is happening with this
                repair.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <RepairStatusBadge status={repair.currentStatus} prominent />
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <DetailValue
                  label="Ticket Number"
                  value={repair.ticketNumber}
                  mono
                />
                <DetailValue
                  label="Tracking Code"
                  value={repair.trackingCode}
                  mono
                />
              </dl>
              <RepairLifecycleActions
                repairId={repair.id}
                allowedTransitions={allowedTransitions}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
