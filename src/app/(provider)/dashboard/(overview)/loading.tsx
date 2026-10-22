import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-64 max-w-full sm:h-10" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-11 w-full sm:h-9 sm:w-36" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="p-4 sm:p-5">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="mt-4 h-4 w-24" />
            <Skeleton className="mt-2 h-8 w-12" />
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Card className="overflow-hidden p-0">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
            >
              <Skeleton className="size-5 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
