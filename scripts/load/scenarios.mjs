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
  // Alternate statuses while identifying genuine same-Repair overlaps.
  const nextStatus = new Map(repairs.map((id) => [id, "WAITING_FOR_PARTS"]));
  const inFlight = new Map();
  return async () => {
    const repairId = repairs[cursor % repairs.length];
    cursor += 1;
    const target = nextStatus.get(repairId);
    const pending = inFlight.get(repairId) ?? new Set();
    let finishAttempt;
    const attempt = {
      overlaps: [],
      completed: new Promise((resolve) => {
        finishAttempt = resolve;
      }),
    };
    for (const other of pending) {
      other.overlaps.push(attempt);
      attempt.overlaps.push(other);
    }
    pending.add(attempt);
    inFlight.set(repairId, pending);
    let error;
    try {
      ({ error } = await ctx.owner.rpc("change_repair_status", {
        p_repair_id: repairId,
        p_next_status: target,
      }));
    } catch (cause) {
      finishAttempt({ failed: true });
      throw cause;
    } finally {
      pending.delete(attempt);
      if (pending.size === 0) inFlight.delete(repairId);
    }
    finishAttempt({ failed: Boolean(error) });
    if (!error) {
      nextStatus.set(
        repairId,
        target === "WAITING_FOR_PARTS" ? "IN_PROGRESS" : "WAITING_FOR_PARTS",
      );
    }
    const expectedRejection =
      Boolean(error?.message?.includes("INVALID_STATUS_TRANSITION")) &&
      (
        await Promise.all(attempt.overlaps.map((other) => other.completed))
      ).some((outcome) => !outcome.failed);
    return {
      ok: !error || expectedRejection,
      kind: expectedRejection ? "expected-rejection" : error ? "error" : "ok",
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
    if (error || typeof row?.allowed !== "boolean")
      return {
        ok: false,
        error: error?.message ?? "invalid rate-limit result",
      };
    return { ok: true, denied: !row.allowed };
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
    const durable = await ctx.service
      .from("repairs")
      .select("current_status")
      .eq("id", repairId)
      .single();
    const events = await ctx.service
      .from("repair_status_events")
      .select("from_status, to_status")
      .eq("repair_id", repairId);
    const winningStatus = !a.error ? "WAITING_FOR_PARTS" : "READY";
    const transitions =
      events.data?.filter((event) => event.from_status === "IN_PROGRESS") ?? [];
    const valid =
      winners.length === 1 &&
      losers.length === 1 &&
      losers[0].error?.message?.includes("INVALID_STATUS_TRANSITION") &&
      !durable.error &&
      durable.data?.current_status === winningStatus &&
      !events.error &&
      transitions.length === 1 &&
      transitions[0].to_status === winningStatus;
    return {
      ok: Boolean(valid),
      denied: false,
      kind: valid ? "expected-rejection" : "error",
      error: valid
        ? null
        : losers.map((r) => r.error?.message).join("; ") ||
          "Repair race invariant failed",
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
    const referenceCode = row?.reference_code;
    if (submitRes.error || !referenceCode)
      return { ok: false, error: submitRes.error?.message ?? "no request id" };

    // submit_repair_request returns the public reference_code only; resolve
    // the durable id through the service role before racing on it.
    const lookup = await ctx.service
      .from("repair_requests")
      .select("id")
      .eq("reference_code", referenceCode)
      .single();
    const requestId = lookup.error ? undefined : lookup.data?.id;
    if (!requestId)
      return { ok: false, error: lookup.error?.message ?? "no request row" };

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
    const expected =
      losers.length === 1 &&
      [accept, decline].filter((r) => !r.error).length === 1 &&
      losers.every((r) =>
        r.error?.message?.includes("REQUEST_ALREADY_PROCESSED"),
      );
    const durable = await ctx.service
      .from("repair_requests")
      .select("status, accepted_at, declined_at")
      .eq("id", requestId)
      .single();
    const repairs = await ctx.service
      .from("repairs")
      .select("id, current_status")
      .eq("repair_request_id", requestId);
    const accepted = !accept.error;
    const valid =
      expected &&
      !durable.error &&
      !repairs.error &&
      (accepted
        ? durable.data?.status === "ACCEPTED" &&
          durable.data.accepted_at &&
          !durable.data.declined_at &&
          repairs.data?.length === 1 &&
          repairs.data[0].current_status === "IN_PROGRESS"
        : durable.data?.status === "DECLINED" &&
          durable.data.declined_at &&
          !durable.data.accepted_at &&
          repairs.data?.length === 0);
    return {
      ok: Boolean(valid),
      denied: false,
      kind: valid ? "expected-rejection" : "error",
      error: valid
        ? null
        : losers.map((r) => r.error?.message).join("; ") ||
          "Request race invariant failed",
    };
  };
}

async function pageFetch(ctx, pathname) {
  const res = await fetch(`${ctx.appUrl}${pathname}`, {
    headers: {
      cookie: `${ctx.ssrCookie.name}=${ctx.ssrCookie.value}`,
      "x-tracknologia-load-harness": "1",
    },
    redirect: "manual",
  });
  res.body?.cancel();
  return res;
}
