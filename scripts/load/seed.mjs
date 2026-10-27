import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { resolveEnv } from "./lib/env.mjs";
import {
  createServiceClient,
  createUserClient,
  mintSupabaseJwt,
} from "./lib/supabase.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "outputs");
const FIXTURES_PATH = path.join(OUTPUT_DIR, "fixtures.json");

const OWNER_PASSWORD = randomUUID();

async function main() {
  const env = resolveEnv();
  const admin = createServiceClient(env.url, env.serviceRoleKey);
  const email = `load-harness-${randomUUID()}@example.test`;

  const created = await admin.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw new Error(`create user: ${created.error.message}`);
  const user = created.data.user;
  if (!user?.id) throw new Error("create user returned no id");

  const ownerToken = mintSupabaseJwt(user.id, env.jwtSecret, {
    expiresInSeconds: 3600,
  });
  const owner = createUserClient(env.url, env.anonKey, ownerToken);

  const providerRes = await owner.rpc("create_provider_with_owner", {
    p_display_name: `Load Harness Provider ${randomUUID().slice(0, 8)}`,
    p_provider_type: "SHOP",
    p_owner_display_name: "Load Harness Owner",
    p_owner_contact_phone: "+15550001111",
    p_contact_email: email,
    p_contact_phone: "+15550001111",
    p_public_address: "1 Load Test Way",
    p_service_area: "Test City",
    p_supported_devices: ["phones", "laptops"],
  });
  if (providerRes.error)
    throw new Error(`create_provider_with_owner: ${providerRes.error.message}`);
  const providerRow = Array.isArray(providerRes.data)
    ? providerRes.data[0]
    : providerRes.data;
  const providerId = providerRow?.provider_id;
  const providerSlug = providerRow?.slug;
  if (!providerId || !providerSlug)
    throw new Error("create_provider_with_owner returned no provider");

  const setModes = await owner.rpc("set_provider_service_modes", {
    p_service_modes: [{ mode: "DROP_OFF" }],
  });
  if (setModes.error)
    throw new Error(`set_provider_service_modes: ${setModes.error.message}`);

  const repairs = [];
  const REPAIR_COUNT = Number(process.env.SEED_REPAIR_COUNT ?? 40);
  for (let i = 0; i < REPAIR_COUNT; i += 1) {
    const repairRes = await owner.rpc("create_provider_repair", {
      p_customer_name: `Repair Customer ${i}`,
      p_customer_phone: "+15550002222",
      p_device_type: "phone",
      p_reported_problem: "Battery drains quickly",
      p_brand: "TestBrand",
      p_model: `Model-${i}`,
      p_initial_observation: "Diagnosis pending",
      p_diagnosis: "In progress",
      p_service_mode: "DROP_OFF",
    });
    if (repairRes.error)
      throw new Error(
        `create_provider_repair ${i}: ${repairRes.error.message}`,
      );
    const row = Array.isArray(repairRes.data)
      ? repairRes.data[0]
      : repairRes.data;
    repairs.push({
      repairId: row?.repair_id,
      ticketNumber: row?.ticket_number,
      trackingCode: row?.tracking_code,
    });
  }

  const requests = [];
  const REQUEST_COUNT = Number(process.env.SEED_REQUEST_COUNT ?? 10);
  const publicClient = createServiceClient(env.url, env.serviceRoleKey);
  for (let i = 0; i < REQUEST_COUNT; i += 1) {
    const requestRes = await publicClient.rpc("submit_repair_request", {
      p_provider_slug: providerSlug,
      p_customer_name: `Request Customer ${i}`,
      p_customer_phone: "+15550003333",
      p_customer_email: `request-${randomUUID()}@example.test`,
      p_device_type: "laptop",
      p_brand: "TestBrand",
      p_model: `Laptop-${i}`,
      p_reported_problem: "Screen flickers",
      p_problem_started_at: new Date().toISOString(),
      p_preferred_service_mode: "DROP_OFF",
    });
    if (requestRes.error)
      throw new Error(
        `submit_repair_request ${i}: ${requestRes.error.message}`,
      );
    const row = Array.isArray(requestRes.data)
      ? requestRes.data[0]
      : requestRes.data;
    requests.push({
      requestId: row?.id,
      referenceCode: row?.reference_code,
    });
  }

  const fixtures = {
    url: env.url,
    owner: {
      userId: user.id,
      email,
      providerId,
      providerSlug,
    },
    repairs,
    requests,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  rmSync(FIXTURES_PATH, { force: true });
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  console.log(`Wrote ${FIXTURES_PATH}`);
  console.log(
    `Provider ${providerSlug} (${providerId}), ${repairs.length} repairs, ${requests.length} requests`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
