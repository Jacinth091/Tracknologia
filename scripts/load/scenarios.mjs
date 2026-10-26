import { randomUUID } from "node:crypto";

// Scenario factories for the load harness. Each factory receives the harness
// context (clients + fixtures + app URL) and returns an async task performing
// one operation. Tasks are run concurrently by scripts/load/harness.mjs.
//
// Public operations use the service-role client (matching
// src/lib/supabase/service.ts). Provider operations use a minted-JWT client so
// SECURITY DEFINER RPCs resolve auth.uid() + membership.

export function createDashboardRead(ctx) {
  return async () => {
    const res = await pageFetch(ctx, "/dashboard");
    return {
      ok: res.status === 200,
      denied: res.status === 429,
      httpStatus: res.status,
    };
  };
}

export function createRepairListSearch(ctx) {
  return async () => {
    const res = await pageFetch(ctx, "/dashboard/repairs?page=1");
    return {
      ok: res.status === 200,
      denied: res.status === 429,
      httpStatus: res.status,
    };
  };
}

export function createTrackingLookup(ctx) {
  const codes = ctx.fixtures.repairs.map((r) => r.trackingCode);
  let cursor = 0;
  return async () => {
    const code = codes[cursor % codes.length];
    cursor += 1;
    const { error } = await ctx.service.rpc("lookup_public_repair", {
      p_tracking_code: code,
    });
    return {
      ok: !error,
      denied: Boolean(error?.message?.includes("RATE_LIMIT")),
      error: error?.message,
    };
  };
}

export function createRequestSubmit(ctx) {
  const slug = ctx.fixtures.owner.providerSlug;
  return async () => {
    const { error } = await ctx.service.rpc("submit_repair_request", {
      p_provider_slug: slug,
      p_customer_name: `Load Customer ${randomUUID().slice(0, 8)}`,
      p_customer_phone: "+15550009999",
      p_customer_email: `load-${randomUUID()}@example.test`,
      p_device_type: "phone",
      p_brand: "TestBrand",
      p_model: "LoadModel",
      p_reported_problem: "Battery drains quickly",
      p_problem_started_at: new Date().toISOString(),
      p_preferred_service_mode: "DROP_OFF",
    });
    return {
      ok: !error,
      denied: Boolean(error?.message?.includes("RATE_LIMIT")),
      error: error?.message,
    };
  };
}

export function createStatusChange(ctx) {
  const repairs = ctx.fixtures.repairs.map((r) => r.repairId);
  let cursor = 0;
  // Alternate IN_PROGRESS <-> WAITING_FOR_PARTS so every transition is legal
  // and the same Repair can be exercised repeatedly.
  const nextStatus = new Map(repairs.map((id) => [id, "WAITING_FOR_PARTS"]));
  return async () => {
    const repairId = repairs[cursor % repairs.length];
    cursor += 1;
    const target = nextStatus.get(repairId);
    const { error } = await ctx.owner.rpc("change_repair_status", {
      p_repair_id: repairId,
      p_next_status: target,
    });
    nextStatus.set(
      repairId,
      target === "WAITING_FOR_PARTS" ? "IN_PROGRESS" : "WAITING_FOR_PARTS",
    );
    return {
      ok: !error,
      denied: Boolean(error?.message?.includes("RATE_LIMIT")),
      error: error?.message,
    };
  };
}

export function createAnalyticsObservation(ctx) {
  const codes = ctx.fixtures.repairs.map((r) => r.trackingCode);
  let cursor = 0;
  return async () => {
    const code = codes[cursor % codes.length];
    cursor += 1;
    const { error } = await ctx.service.rpc("record_successful_tracking_view", {
      p_tracking_code: code,
    });
    return {
      ok: !error,
      denied: Boolean(error?.message?.includes("RATE_LIMIT")),
      error: error?.message,
    };
  };
}

export function createAbuseBurst(ctx) {
  // A fixed actor key plus a small max floods the durable rate-limit table:
  // once the window is full every further call is denied, proving the control
  // holds under burst rather than degrading.
  const actorKey = "ab" + "0".repeat(62);
  return async () => {
    const { data, error } = await ctx.service.rpc(
      "check_public_operation_rate_limit",
      {
        p_operation: "tracking_lookup",
        p_actor_key: actorKey,
        p_window_seconds: 60,
        p_max_requests: 50,
      },
    );
    const row = Array.isArray(data) ? data[0] : data;
    const denied = Boolean(row && row.allowed === false) || Boolean(error);
    return { ok: !denied, denied, error: error?.message };
  };
}

export function createRaceSameRepair(ctx) {
  let ttl = 0;
  return async () => {
    ttl += 1;
    const repairRes = await ctx.owner.rpc("create_provider_repair", {
      p_customer_name: `Race Customer ${ttl}`,
      p_customer_phone: "+15550007777",
      p_device_type: "phone",
      p_reported_problem: "Race race",
      p_service_mode: "DROP_OFF",
    });
    const row = Array.isArray(repairRes.data)
      ? repairRes.data[0]
      : repairRes.data;
    const repairId = row?.repair_id;
    if (repairRes.error || !repairId)
      return { ok: false, error: repairRes.error?.message ?? "no repair id" };

    // Two concurrent transitions on the same Repair: one to WAITING_FOR_PARTS,
    // one to READY. Exactly one must win; the loser is rejected.
    const [a, b] = await Promise.all([
      ctx.owner.rpc("change_repair_status", {
        p_repair_id: repairId,
        p_next_status: "WAITING_FOR_PARTS",
      }),
      ctx.owner.rpc("change_repair_status", {
        p_repair_id: repairId,
        p_next_status: "READY",
      }),
    ]);
    const winners = [a, b].filter((r) => !r.error);
    const losers = [a, b].filter((r) => r.error);
    return {
      ok: winners.length === 1,
      denied: false,
      kind:
        losers.length > 0 &&
        losers.every((r) =>
          r.error?.message?.includes("INVALID_STATUS_TRANSITION"),
        )
          ? "expected-rejection"
          : winners.length === 1
            ? "ok"
            : "error",
      error:
        losers
          .filter(
            (r) => !r.error?.message?.includes("INVALID_STATUS_TRANSITION"),
          )
          .map((r) => r.error?.message)
          .join("; ") || null,
    };
  };
}

export function createRaceSameRequest(ctx) {
  let ttl = 0;
  return async () => {
    ttl += 1;
    const submitRes = await ctx.service.rpc("submit_repair_request", {
      p_provider_slug: ctx.fixtures.owner.providerSlug,
      p_customer_name: `Race Request ${ttl}`,
      p_customer_phone: "+15550008888",
      p_customer_email: `race-${randomUUID()}@example.test`,
      p_device_type: "phone",
      p_reported_problem: "Request race",
      p_preferred_service_mode: "DROP_OFF",
    });
    const row = Array.isArray(submitRes.data)
      ? submitRes.data[0]
      : submitRes.data;
    const requestId = row?.id;
    if (submitRes.error || !requestId)
      return { ok: false, error: submitRes.error?.message ?? "no request id" };

    // Concurrent accept + decline on the same Request: exactly one durable
    // outcome; the loser must observe REQUEST_ALREADY_PROCESSED.
    const [accept, decline] = await Promise.all([
      ctx.owner.rpc("create_repair_from_request", {
        p_request_id: requestId,
        p_customer_name: row?.customer_name ?? "Race Request",
        p_customer_phone: row?.customer_phone ?? "+15550008888",
        p_device_type: row?.device_type ?? "phone",
        p_reported_problem: row?.reported_problem ?? "Request race",
        p_service_mode: "DROP_OFF",
      }),
      ctx.owner.rpc("decline_repair_request", { p_request_id: requestId }),
    ]);
    const losers = [accept, decline].filter((r) => r.error);
    const expected = losers.every((r) =>
      r.error?.message?.includes("REQUEST_ALREADY_PROCESSED"),
    );
    return {
      ok: expected,
      denied: false,
      kind: expected ? "expected-rejection" : "error",
      error: expected
        ? null
        : losers.map((r) => r.error?.message).join("; ") || null,
    };
  };
}

async function pageFetch(ctx, pathname) {
  const res = await fetch(`${ctx.appUrl}${pathname}`, {
    headers: {
      cookie: `${ctx.fixtures.ssrCookie.name}=${ctx.fixtures.ssrCookie.value}`,
      "x-tracknologia-load-harness": "1",
    },
    redirect: "manual",
  });
  res.body?.cancel();
  return res;
}
