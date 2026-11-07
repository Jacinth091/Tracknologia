import { Badge } from "@/components/ui/badge";
import type { HealthStatus } from "@/features/internal-operations";

const LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unavailable: "Unavailable",
  unknown: "Unknown",
  stale: "Stale",
};

// Text carries the meaning; the badge variant only adds emphasis.
const VARIANTS: Record<HealthStatus, "secondary" | "outline" | "destructive"> =
  {
    healthy: "secondary",
    degraded: "outline",
    unavailable: "destructive",
    unknown: "outline",
    stale: "outline",
  };

export function formatLatency(latencyMs: number | null): string {
  return latencyMs === null ? "Not probed" : `${latencyMs} ms`;
}

export function formatProbeTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function HealthStatusBadge({ status }: { status: HealthStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
