import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_OPTIONS, type Period } from "./metrics-period";

export function PeriodPicker({
  action,
  period,
  start,
  end,
}: {
  action: string;
  period: Period;
  start?: string;
  end?: string;
}) {
  return (
    <form
      method="get"
      action={action}
      aria-label="Metrics period"
      aria-describedby="metrics-range-help"
      className="space-y-3"
    >
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="metrics-period">Period</Label>
          <select
            id="metrics-period"
            name="period"
            defaultValue={period}
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="metrics-start">Start date</Label>
          <Input
            id="metrics-start"
            name="start"
            type="date"
            defaultValue={start ?? ""}
            className="w-full min-w-0"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="metrics-end">End date (exclusive)</Label>
          <Input
            id="metrics-end"
            name="end"
            type="date"
            defaultValue={end ?? ""}
            className="w-full min-w-0"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="flex-1 sm:flex-none">
            Show period
          </Button>
          {/* Reload resets uncontrolled fields, including same-URL navigation. */}
          <a
            href={action}
            className={buttonVariants({
              variant: "outline",
              className: "flex-1 sm:flex-none",
            })}
          >
            Clear filters
          </a>
        </div>
      </div>
      <p id="metrics-range-help" className="text-xs text-muted-foreground">
        Dates apply to a Custom period. The end date is excluded.
      </p>
    </form>
  );
}
