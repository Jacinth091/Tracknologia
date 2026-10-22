import type { RepairStatus } from "@/features/repairs";
import { StatusGauge } from "@/components/shared/status-gauge";

export function repairStatusLabel(status: RepairStatus) {
  return {
    IN_PROGRESS: "In Progress",
    WAITING_FOR_PARTS: "Waiting for Parts",
    AWAITING_APPROVAL: "Awaiting Approval",
    READY: "Ready",
    COMPLETED: "Completed",
  }[status];
}

export function RepairStatusPill({ status }: { status: RepairStatus }) {
  return (
    <span
      data-status={status}
      className="status-badge shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
    >
      {repairStatusLabel(status)}
    </span>
  );
}

export function RepairStatusBadge({
  status,
  prominent = false,
}: {
  status: RepairStatus;
  prominent?: boolean;
}) {
  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-2">
      <StatusGauge
        status={status}
        className={prominent ? "size-16" : "size-7"}
      />
      <RepairStatusPill status={status} />
    </span>
  );
}
