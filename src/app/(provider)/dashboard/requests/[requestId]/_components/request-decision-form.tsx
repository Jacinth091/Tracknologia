"use client";

import { useActionState } from "react";

import { CopyButton } from "@/components/shared/copy-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProviderServiceMode } from "@/features/providers";
import type { RepairRequestDetail } from "@/features/repair-requests";

import {
  acceptRepairRequestAction,
  declineRepairRequestAction,
} from "../../actions";

const SERVICE_MODE_LABELS = {
  DROP_OFF: "Drop-off",
  MEETUP: "Meetup",
  HOME_SERVICE: "Home service",
  OTHER: "Other arrangement",
} as const;

function SummaryValue({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm whitespace-pre-wrap wrap-anywhere text-foreground">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

interface RequestDecisionFormProps {
  request: RepairRequestDetail;
  serviceModes: ProviderServiceMode[];
}

export function RequestDecisionForm({
  request,
  serviceModes,
}: RequestDecisionFormProps) {
  const [acceptState, acceptAction, acceptPending] = useActionState(
    acceptRepairRequestAction,
    null,
  );
  const [declineState, declineAction, declinePending] = useActionState(
    declineRepairRequestAction,
    null,
  );
  const preferredModeSupported = serviceModes.some(
    (mode) => mode.mode === request.preferredServiceMode,
  );

  if (acceptState?.acceptedRepair) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">Repair created</CardTitle>
          <CardDescription>
            Request is accepted. New Repair starts IN_PROGRESS.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Ticket Number
            </p>
            <div className="mt-1 flex items-center gap-1">
              <p className="min-w-0 font-mono font-semibold break-all">
                {acceptState.acceptedRepair.ticketNumber}
              </p>
              <CopyButton
                iconOnly
                text={acceptState.acceptedRepair.ticketNumber}
                label="Copy ticket number"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Tracking Code
            </p>
            <div className="mt-1 flex items-center gap-1">
              <p className="min-w-0 font-mono font-semibold break-all">
                {acceptState.acceptedRepair.trackingCode}
              </p>
              <CopyButton
                iconOnly
                text={acceptState.acceptedRepair.trackingCode}
                label="Copy tracking code"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (declineState?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request declined</CardTitle>
          <CardDescription>
            No Repair was created. Request cannot be processed again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer request (read-only)</CardTitle>
          <CardDescription>
            Details can be edited on the Repair after you accept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <SummaryValue label="Customer name" value={request.customerName} />
            <SummaryValue
              label="Customer phone"
              value={request.customerPhone}
            />
            <SummaryValue
              label="Customer email"
              value={request.customerEmail}
            />
            <SummaryValue label="Device type" value={request.deviceType} />
            <SummaryValue label="Brand" value={request.brand} />
            <SummaryValue label="Model" value={request.model} />
            <SummaryValue label="Serial number" value={request.serialNumber} />
            <SummaryValue
              label="Color or variant"
              value={request.colorVariant}
            />
            <div className="sm:col-span-2">
              <SummaryValue
                label="Device specifications"
                value={request.deviceSpecs}
              />
            </div>
            <div className="sm:col-span-2">
              <SummaryValue
                label="Reported Problem"
                value={request.reportedProblem}
              />
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Your decision</CardTitle>
          <CardDescription>
            Choose the Service Mode and add Internal Notes before accepting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={acceptAction} className="space-y-6">
            <input type="hidden" name="requestId" value={request.id} />

            {acceptState?.error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{acceptState.error}</AlertDescription>
              </Alert>
            )}

            <section className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">
                  Service arrangement
                </h3>
                <p className="text-xs text-muted-foreground">
                  Customer preference may be changed before Repair creation.
                </p>
              </div>
              {serviceModes.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/80 p-4">
                    <input
                      type="radio"
                      name="serviceMode"
                      value=""
                      defaultChecked={!preferredModeSupported}
                      className="mt-1 accent-ring"
                      disabled={acceptPending}
                    />
                    <span className="text-sm font-medium">No Service Mode</span>
                  </label>
                  {serviceModes.map((mode) => (
                    <label
                      key={mode.mode}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/80 p-4"
                    >
                      <input
                        type="radio"
                        name="serviceMode"
                        value={mode.mode}
                        defaultChecked={
                          preferredModeSupported &&
                          request.preferredServiceMode === mode.mode
                        }
                        className="mt-1 accent-ring"
                        disabled={acceptPending}
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {SERVICE_MODE_LABELS[mode.mode]}
                        </span>
                        {mode.details && (
                          <span className="text-xs text-muted-foreground">
                            {mode.details}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <>
                  <input type="hidden" name="serviceMode" value="" />
                  <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Provider has no configured Service Modes. Repair can be
                    created without one.
                  </p>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="serviceModeDetails">Arrangement details</Label>
                <Input
                  id="serviceModeDetails"
                  name="serviceModeDetails"
                  defaultValue={
                    preferredModeSupported
                      ? (request.serviceModeDetails ?? "")
                      : ""
                  }
                  maxLength={240}
                  disabled={acceptPending}
                />
              </div>
            </section>

            <section className="space-y-2">
              <Label htmlFor="internalNotes">Internal Notes</Label>
              <p className="text-xs text-muted-foreground">
                Private to your team. Never shown to the customer.
              </p>
              <Textarea
                id="internalNotes"
                name="internalNotes"
                maxLength={4000}
                disabled={acceptPending}
              />
            </section>

            <Button type="submit" size="lg" disabled={acceptPending}>
              {acceptPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" /> Creating Repair...
                </span>
              ) : (
                "Accept & Create Repair"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Decline Request</CardTitle>
          <CardDescription>
            Declining is terminal for Request and creates no Repair.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={declineAction}
            onSubmit={(event) => {
              if (!window.confirm("Decline this Repair Request?")) {
                event.preventDefault();
              }
            }}
            className="space-y-3"
          >
            <input type="hidden" name="requestId" value={request.id} />
            {declineState?.error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{declineState.error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              variant="destructive"
              disabled={declinePending || acceptPending}
            >
              {declinePending ? "Declining..." : "Decline Request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
