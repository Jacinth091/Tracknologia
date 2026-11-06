import {
  buildValidationReport,
  getValidationMetrics,
  MetricsError,
  requireInternalOperator,
  validationReportToCsv,
  validationReportToJson,
} from "@/features/internal-operations";
import {
  firstSearchParam,
  nonEmptyParam,
  selectedPeriod,
  windowInput,
} from "../../_components/metrics-period";

// Exports must reflect live rows, never a cached copy.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function text(body: string, status: number, headers: Record<string, string>) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const format = params.get("format");

  // Checked first so a bad link is a plain 400 for every caller.
  if (format !== "csv" && format !== "json") {
    return text("Use format=csv or format=json.", 400, NO_STORE);
  }

  const access = await requireInternalOperator();
  if (access.status === "UNAUTHENTICATED") {
    return text("Sign in required.", 401, NO_STORE);
  }
  if (access.status === "FORBIDDEN") {
    return text("Not found.", 404, NO_STORE);
  }
  if (access.status === "UNAVAILABLE") {
    return text("Reports are unavailable. Please try again.", 503, NO_STORE);
  }

  const period = selectedPeriod(
    firstSearchParam(params.get("period") ?? undefined),
  );
  const start = nonEmptyParam(params.get("start") ?? undefined);
  const end = nonEmptyParam(params.get("end") ?? undefined);

  try {
    const metrics = await getValidationMetrics(windowInput(period, start, end));
    const report = buildValidationReport(metrics);
    const body =
      format === "csv"
        ? validationReportToCsv(report)
        : validationReportToJson(report);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="validation-report-${metrics.window.startDate}-to-${metrics.window.endDateExclusive}.${format}"`,
        "X-Content-Type-Options": "nosniff",
        ...NO_STORE,
      },
    });
  } catch (error) {
    if (error instanceof MetricsError) {
      if (error.code === "FORBIDDEN") return text("Not found.", 404, NO_STORE);
      if (error.code === "UNAVAILABLE") {
        return text(
          "Reports are unavailable. Please try again.",
          503,
          NO_STORE,
        );
      }
      return text(
        "That period is not valid. Use today, 7 or 30 days, or a custom range up to 90 days.",
        400,
        NO_STORE,
      );
    }
    throw error;
  }
}
