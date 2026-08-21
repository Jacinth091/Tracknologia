import { cn } from "@/lib/utils";

export interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "default" | "lg";
}

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  default: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-3",
};

/**
 * Placeholder loading spinner for auth and asynchronous transitions.
 * Can be swapped easily with custom animations or SVG assets later.
 */
export function LoadingSpinner({
  className,
  size = "default",
}: LoadingSpinnerProps) {
  return (
    <div
      data-slot="loading-spinner"
      className={cn(
        "inline-block animate-spin rounded-full border-current border-t-transparent text-primary-foreground",
        sizeClasses[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
