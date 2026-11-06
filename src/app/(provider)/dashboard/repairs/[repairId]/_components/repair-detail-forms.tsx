"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProviderServiceMode } from "@/features/providers";
import type { RepairDetail, RepairStatus } from "@/features/repairs";

import {
  addCustomerUpdateAction,
  changeRepairStatusAction,
  completeRepairAction,
  updateRepairDetailsAction,
  type RepairActionState,
} from "../../actions";
import {
  RepairFields,
  type RepairFieldValues,
} from "../../_components/repair-fields";
import { repairStatusLabel } from "../../../_components/repair-status-badge";

function ActionMessage({ state }: { state: RepairActionState | null }) {
  if (state?.error) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  if (state?.success) {
    return (
      <Alert>
        <AlertDescription>{state.success}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

function repairValues(repair: RepairDetail): RepairFieldValues {
  return {
    customerName: repair.customerName,
    customerPhone: repair.customerPhone,
    customerEmail: repair.customerEmail ?? "",
    deviceType: repair.deviceType,
    brand: repair.brand ?? "",
    model: repair.model ?? "",
    serialNumber: repair.serialNumber ?? "",
    colorVariant: repair.colorVariant ?? "",
    deviceSpecs: repair.deviceSpecs ?? "",
    physicalCondition: repair.physicalCondition ?? "",
    accessoriesReceived: repair.accessoriesReceived ?? "",
    reportedProblem: repair.reportedProblem,
    initialObservation: repair.initialObservation ?? "",
    diagnosis: repair.diagnosis ?? "",
    internalNotes: repair.internalNotes ?? "",
    serviceMode: repair.serviceMode ?? "",
    serviceModeDetails: repair.serviceModeDetails ?? "",
  };
}

// Lifecycle actions for the sticky status panel. Rendered without its own
// Card so the page can place it inside the panel.
export function RepairLifecycleActions({
  repairId,
  allowedTransitions,
}: {
  repairId: string;
  allowedTransitions: RepairStatus[];
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    changeRepairStatusAction,
    null,
  );
  const [completeState, completeAction, completePending] = useActionState(
    completeRepairAction,
    null,
  );
  const operationalTransitions = allowedTransitions.filter(
    (status): status is Exclude<RepairStatus, "COMPLETED"> =>
      status !== "COMPLETED",
  );
  const canComplete = allowedTransitions.includes("COMPLETED");

  return (
    <div className="space-y-4">
      <ActionMessage state={statusState} />
      <ActionMessage state={completeState} />
      {operationalTransitions.length > 0 ? (
        <form action={statusAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="repairId" value={repairId} />
          {operationalTransitions.map((status) => (
            <Button
              key={status}
              type="submit"
              name="nextStatus"
              value={status}
              variant={status === "READY" ? "default" : "outline"}
              disabled={statusPending || completePending}
            >
              {statusPending ? "Updating..." : repairStatusLabel(status)}
            </Button>
          ))}
        </form>
      ) : null}
      {canComplete ? (
        <form action={completeAction}>
          <input type="hidden" name="repairId" value={repairId} />
          <Button type="submit" disabled={completePending || statusPending}>
            {completePending ? "Completing..." : "Mark Completed"}
          </Button>
        </form>
      ) : null}
      {allowedTransitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This repair is completed and cannot be reopened.
        </p>
      ) : null}
    </div>
  );
}

export function RepairDetailForms({
  repair,
  serviceModes,
}: {
  repair: RepairDetail;
  serviceModes: ProviderServiceMode[];
}) {
  const [detailState, detailAction, detailPending] = useActionState(
    updateRepairDetailsAction,
    null,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    addCustomerUpdateAction,
    null,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Customer Update</CardTitle>
          <CardDescription>
            Customer-visible progress information. This does not change status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAction} className="space-y-3">
            <input type="hidden" name="repairId" value={repair.id} />
            <ActionMessage state={updateState} />
            <div className="space-y-2">
              <Label htmlFor="message">Update message</Label>
              <Textarea
                id="message"
                name="message"
                maxLength={2000}
                rows={4}
                required
                disabled={updatePending}
                aria-invalid={Boolean(updateState?.fieldErrors?.message)}
              />
              {updateState?.fieldErrors?.message ? (
                <p className="text-xs text-destructive" role="alert">
                  {updateState.fieldErrors.message}
                </p>
              ) : null}
            </div>
            <Button type="submit" variant="outline" disabled={updatePending}>
              {updatePending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" /> Adding Update...
                </span>
              ) : (
                "Add Customer Update"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit Repair details</CardTitle>
          <CardDescription>
            Update customer and device details, your diagnosis, and private
            internal notes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details>
            <summary className="cursor-pointer py-2 text-sm font-medium text-foreground">
              Open edit form
            </summary>
            <form action={detailAction} className="mt-6 space-y-8">
              <input type="hidden" name="repairId" value={repair.id} />
              <ActionMessage state={detailState} />
              <RepairFields
                values={repairValues(repair)}
                fieldErrors={detailState?.fieldErrors}
                serviceModes={serviceModes}
                recordedServiceMode={repair.serviceMode}
                disabled={detailPending}
              />
              <Button type="submit" disabled={detailPending}>
                {detailPending ? "Saving..." : "Save Repair Details"}
              </Button>
            </form>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
