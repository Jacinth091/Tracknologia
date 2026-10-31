import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Same markup and status tokens as the Provider dashboard tiles.
type StatusToken =
  | "SUBMITTED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "AWAITING_APPROVAL"
  | "READY"
  | "COMPLETED";

export function StatTile({
  href,
  label,
  value,
  detail,
  status,
  icon,
}: {
  href?: string;
  label: string;
  value: ReactNode;
  detail?: string;
  status: StatusToken;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
}) {
  const tile = (
    <Card className="relative h-full overflow-hidden transition-colors group-hover:border-input">
      <span
        aria-hidden="true"
        data-status={status}
        className="status-badge absolute inset-x-0 top-0 h-1 bg-current"
      />
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4 sm:p-5">
        <div className="min-w-0 space-y-2">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
          {detail ? (
            <p className="text-xs text-muted-foreground">{detail}</p>
          ) : null}
        </div>
        <span
          data-status={status}
          className="status-badge flex size-9 shrink-0 items-center justify-center rounded-lg"
        >
          <HugeiconsIcon icon={icon} aria-hidden="true" className="size-4" />
        </span>
      </CardHeader>
    </Card>
  );

  if (!href) {
    return tile;
  }

  return (
    <Link href={href} className="group">
      {tile}
    </Link>
  );
}
