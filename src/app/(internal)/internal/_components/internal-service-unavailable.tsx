import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * Safe unavailable state for internal access or audit failures. It never signs
 * the user out and never reveals internal data.
 */
export function InternalServiceUnavailable() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="max-w-md w-full p-6 border border-border rounded-lg shadow-xs bg-card space-y-4 text-center">
        <h2 className="text-xl font-bold text-foreground">
          Internal access unavailable
        </h2>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t verify internal operator access right now. Your
          session has not been signed out. Please try again in a moment.
        </p>
        <div className="pt-2 flex justify-center">
          <Link href="/internal" className={buttonVariants({ size: "sm" })}>
            Try again
          </Link>
        </div>
      </div>
    </div>
  );
}
