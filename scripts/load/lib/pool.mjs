// Runs a load burst: `concurrency` concurrent workers each repeatedly executing
// `task` until `durationMs` elapses. Workers are scheduled across `rampMs` so a
// profile can start cold and heat up, matching the plan's start->increase steps.

export async function runBurst({ concurrency, durationMs, rampMs = 0, task }) {
  const results = [];
  const start = performance.now();

  await Promise.all(
    Array.from({ length: concurrency }, async (_, workerIndex) => {
      const workerStart =
        rampMs > 0
          ? start + (workerIndex / Math.max(1, concurrency - 1)) * rampMs
          : start;
      if (workerStart > performance.now()) {
        await sleep(workerStart - performance.now());
      }

      while (performance.now() - start < durationMs) {
        const began = performance.now();
        try {
          const outcome = await task();
          results.push({
            latencyMs: performance.now() - began,
            ok: outcome.ok !== false && outcome.kind !== "error",
            denied: Boolean(outcome.denied),
            kind: outcome.kind ?? "ok",
            httpStatus: outcome.httpStatus ?? null,
            error: outcome.error ?? null,
          });
        } catch (error) {
          results.push({
            latencyMs: performance.now() - began,
            ok: false,
            denied: false,
            kind: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  return results;
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function summarize(results) {
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const count = latencies.length;
  const percentile = (p) => {
    if (count === 0) return 0;
    const index = Math.min(
      count - 1,
      Math.max(0, Math.ceil((p / 100) * count) - 1),
    );
    return Math.round(latencies[index] * 10) / 10;
  };
  const errorCount = results.filter((r) => !r.ok).length;
  const deniedCount = results.filter((r) => r.denied).length;
  const errMessages = [
    ...new Set(results.filter((r) => r.error).map((r) => r.error)),
  ];

  return {
    count,
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    errorCount,
    deniedCount,
    httpStatusCounts: Object.fromEntries(
      [
        ...new Set(results.map((r) => r.httpStatus).filter((s) => s != null)),
      ].map((status) => [
        status,
        results.filter((r) => r.httpStatus === status).length,
      ]),
    ),
    errorKinds: errMessages,
  };
}
