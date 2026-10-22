import type { RepairRequestStatus } from "@/features/repair-requests";
import type { RepairStatus } from "@/features/repairs";
import { cn } from "@/lib/utils";

// Brand-defined illustrations of named states, not measured repair completion.
const CHARGE: Record<RepairStatus | RepairRequestStatus, number> = {
  SUBMITTED: 15,
  ACCEPTED: 30,
  DECLINED: 0,
  IN_PROGRESS: 50,
  WAITING_FOR_PARTS: 50,
  AWAITING_APPROVAL: 50,
  READY: 85,
  COMPLETED: 100,
};

export function StatusGauge({
  status,
  label,
  className,
}: {
  status: RepairStatus | RepairRequestStatus | null;
  label?: string;
  className?: string;
}) {
  const charge = status === null ? 0 : CHARGE[status];
  const held = status === "WAITING_FOR_PARTS" || status === "AWAITING_APPROVAL";
  const declined = status === "DECLINED";

  return (
    <svg
      viewBox="0 0 50 50"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={cn("size-20 shrink-0 text-foreground", className)}
    >
      <circle
        cx="25"
        cy="25"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeDasharray={status === null ? "4 5" : undefined}
        opacity={declined || status === null ? 0.45 : 1}
      />
      {charge > 0 && (
        <circle
          cx="25"
          cy="25"
          r="7.5"
          fill="none"
          strokeWidth="15"
          pathLength="100"
          strokeDasharray={`${charge} 100`}
          transform="rotate(-90 25 25)"
          className={cn("stroke-primary", held && "status-gauge-held")}
        />
      )}
      {declined && (
        <path
          d="M15 35 35 15"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.45"
        />
      )}
    </svg>
  );
}
