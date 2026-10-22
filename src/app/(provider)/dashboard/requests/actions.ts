"use server";

import { revalidatePath } from "next/cache";

import {
  acceptRepairRequest,
  declineRepairRequest,
  RepairRequestError,
  type AcceptRepairRequestDecision,
} from "@/features/repair-requests";

export interface RepairRequestActionState {
  error?: string;
  success?: string;
  acceptedRepair?: {
    ticketNumber: string;
    trackingCode: string;
  };
}

export async function acceptRepairRequestAction(
  _previousState: RepairRequestActionState | null,
  formData: FormData,
): Promise<RepairRequestActionState> {
  const requestId = formData.get("requestId")?.toString() ?? "";
  // Only the Provider's decision is read. The customer's details come from the
  // stored Request, never from the form.
  const decision: AcceptRepairRequestDecision = {
    serviceMode: formData.get("serviceMode")?.toString(),
    serviceModeDetails: formData.get("serviceModeDetails")?.toString(),
    internalNotes: formData.get("internalNotes")?.toString(),
  };

  try {
    const repair = await acceptRepairRequest(requestId, decision);
    revalidatePath("/dashboard/requests");
    return {
      success: "Request accepted and Repair created",
      acceptedRepair: {
        ticketNumber: repair.ticketNumber,
        trackingCode: repair.trackingCode,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof RepairRequestError
          ? error.message
          : "Unable to accept this Repair Request",
    };
  }
}

export async function declineRepairRequestAction(
  _previousState: RepairRequestActionState | null,
  formData: FormData,
): Promise<RepairRequestActionState> {
  const requestId = formData.get("requestId")?.toString() ?? "";

  try {
    await declineRepairRequest(requestId);
    revalidatePath("/dashboard/requests");
    return { success: "Repair Request declined" };
  } catch (error) {
    return {
      error:
        error instanceof RepairRequestError
          ? error.message
          : "Unable to decline this Repair Request",
    };
  }
}
