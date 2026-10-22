"use client";

import { useActionState } from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import { Wrench01Icon } from "@hugeicons/core-free-icons";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { ProviderServiceMode } from "@/features/providers";

import { createRepairAction } from "../../actions";
import {
  RepairFields,
  type RepairFieldValues,
} from "../../_components/repair-fields";

export function CreateRepairForm({
  serviceModes,
}: {
  serviceModes: ProviderServiceMode[];
}) {
  const [state, action, pending] = useActionState(createRepairAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={Wrench01Icon}
            aria-hidden="true"
            className="size-5"
          />
          Repair intake
        </CardTitle>
        <CardDescription>
          Record the customer, device, and reported problem to start a repair.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-8">
          {state?.error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <RepairFields
            values={state?.values as RepairFieldValues | undefined}
            fieldErrors={state?.fieldErrors}
            serviceModes={serviceModes}
            disabled={pending}
          />

          <Button
            type="submit"
            size="lg"
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" /> Creating Repair...
              </span>
            ) : (
              "Create Repair"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
