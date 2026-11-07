import { cn } from "@/lib/utils";

export interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "default" | "lg";
}

const sizeClasses = {
  sm: "size-4",
  default: "size-5",
  lg: "size-8",
};

// A charging gauge: the brand ring in currentColor with a yellow pie that
// fills. The fill animation lives in globals.css and is off under reduced
// motion, where the pie holds at about 60%.
export function LoadingSpinner({
  className,
  size = "default",
}: LoadingSpinnerProps) {
  return (
    <span
      data-slot="loading-spinner"
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-flex shrink-0 text-current",
        sizeClasses[size],
        className,
      )}
    >
      <svg
        viewBox="0 0 50 50"
        aria-hidden="true"
        focusable="false"
        className="size-full"
      >
        <circle
          cx="25"
          cy="25"
          r="21"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
        />
        <circle
          cx="25"
          cy="25"
          r="7.5"
          fill="none"
          strokeWidth="15"
          pathLength="100"
          transform="rotate(-90 25 25)"
          className="gauge-charge-pie stroke-primary"
        />
      </svg>
      <span className="sr-only">Loading...</span>
    </span>
  );
}
