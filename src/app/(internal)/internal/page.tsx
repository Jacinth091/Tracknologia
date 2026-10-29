import { notFound, redirect } from "next/navigation";
import {
  recordSensitiveInternalAccess,
  requireInternalOperator,
} from "@/features/internal-operations";
import { InternalServiceUnavailable } from "./_components/internal-service-unavailable";

export default async function InternalPage() {
  // The layout guard is not sufficient by itself: every sensitive internal
  // page operation re-runs the same fail-closed access check.
  const access = await requireInternalOperator();

  if (access.status === "UNAUTHENTICATED") {
    redirect("/login?redirectTo=%2Finternal");
  }

  if (access.status === "FORBIDDEN") {
    notFound();
  }

  if (access.status === "UNAVAILABLE") {
    return <InternalServiceUnavailable />;
  }

  // Required audit must succeed before any protected content renders.
  const audited = await recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW");

  if (!audited) {
    return <InternalServiceUnavailable />;
  }

  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">
        Internal operations
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        This private area is limited to enabled internal operators. Sensitive
        internal review surfaces are not enabled yet, and operator access is
        recorded in the append-only internal access audit.
      </p>
    </section>
  );
}
