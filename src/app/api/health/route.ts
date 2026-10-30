import { checkReadiness } from "@/features/internal-operations";

// Uptime probes must see live database state, never a prerendered or cached
// answer.
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await checkReadiness();
  const httpStatus = status === "healthy" ? 200 : 503;

  return Response.json(
    { status },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
