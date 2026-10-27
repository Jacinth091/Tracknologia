#!/usr/bin/env node
// UAT Test Data Pack seed (Plan 11 / issue #48).
//
// Seeds the repeatable, realistic data the UAT personas run against, entirely
// through the persistence seams the application itself uses:
//
//   - Tenant rows via service-role inserts (same shape as tests/e2e fixtures).
//   - Repairs/lifecycle via the owner-JWT RPCs so security-definer logic
//     (ticket numbers, tracking codes, status events) executes for real.
//   - Requests via the public submit RPC (service-role, as the app does).
//   - Invitation states (active/expired/revoked) as service-role rows.
//
// Usage:
//   node scripts/uat/seed.mjs                 # seed (run manifest printed)
//   node scripts/uat/seed.mjs --cleanup <manifest.json>   # remove one run
//
// Destructive by design; refuses non-local Supabase hosts. Reset cleanly
// between runs with `pnpm db:reset`. Never run against a shared database.

import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "outputs");

const URL_ENV =
  process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";
const JWT_SECRET =
  process.env.SUPABASE_TEST_JWT_SECRET ||
  process.env.SUPABASE_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "";
const APP_URL =
  process.env.LOAD_APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function fail(message) {
  throw new Error(`[UAT seed] ${message}`);
}

for (const [name, value] of [
  ["SUPABASE_TEST_URL or NEXT_PUBLIC_SUPABASE_URL", URL_ENV],
  ["SUPABASE_TEST_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_TEST_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ANON_KEY],
  ["SUPABASE_TEST_JWT_SECRET or SUPABASE_JWT_SECRET or JWT_SECRET", JWT_SECRET],
]) {
  if (!value)
    fail(`Missing ${name}. All values are printed by \`supabase start\`.`);
}

const parsedUrl = new URL(URL_ENV);
if (!LOCAL_HOSTS.has(parsedUrl.hostname)) {
  fail(
    `Refusing to run destructive UAT seeds against "${URL_ENV}". ` +
      "Target a disposable local Supabase stack only.",
  );
}

// ---------------------------------------------------------------- clients

const admin = createClient(URL_ENV, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const base64UrlEncode = (input) =>
  Buffer.from(input, "utf8").toString("base64url");

function mintSupabaseJwt(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      iss: "supabase-demo",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function ownerClient(user) {
  const anon = createClient(URL_ENV, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${mintSupabaseJwt(user.id)}` },
    },
  });
  return anon;
}

// ---------------------------------------------------------------- guard

function assertOk({ error }, operation) {
  if (error) fail(`${operation} failed: ${error.message}`);
}

// ---------------------------------------------------------------- helpers

const PASSWORD = "UatPassword123!";
const runId = randomUUID().slice(0, 8);
const userIds = [];
const providerIds = [];

async function seedUser(displayName) {
  const email = `uat.${displayName.toLowerCase().replace(/\s+/g, "")}.${runId}@uat.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  assertOk({ error }, `create user ${email}`);
  const user = data.user;
  if (!user?.id) fail(`create user ${email} returned no id`);
  userIds.push({ id: user.id, email });
  assertOk(
    await admin
      .from("provider_user_profiles")
      .insert({ user_id: user.id, display_name: displayName }),
    `create profile for ${displayName}`,
  );
  return user;
}

async function seedProvider({
  type,
  name,
  modes,
  accepting,
  serviceArea,
  address,
}) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${runId}`;
  const { data: provider, error } = await admin
    .from("providers")
    .insert({
      provider_type: type,
      display_name: name,
      slug,
      accepting_requests: accepting,
      ...(address ? { public_address: address } : {}),
      ...(serviceArea ? { service_area: serviceArea } : {}),
    })
    .select("id")
    .single();
  assertOk({ error }, `create provider ${slug}`);
  providerIds.push({ id: provider.id, slug });
  if (modes.length > 0) {
    assertOk(
      await admin
        .from("provider_service_modes")
        .insert(modes.map((mode) => ({ provider_id: provider.id, mode }))),
      `set Service Modes for ${slug}`,
    );
  }
  return { provider: provider.id, slug };
}

async function seedMembership({ provider, user, role }) {
  assertOk(
    await admin.from("provider_memberships").insert({
      provider_id: provider,
      user_id: user.id,
      role,
    }),
    `create ${role} membership`,
  );
}

/** Creates a direct Repair on `provider` transitioning it to `endStatus`. */
async function seedRepair(owner, provider, spec) {
  const { data: created, error } = await owner.rpc("create_provider_repair", {
    p_customer_name: spec.customerName,
    p_customer_phone: spec.phone,
    p_customer_email: `uat.client.${runId}@uat.test`,
    p_device_type: spec.device,
    p_brand: spec.brand,
    p_model: spec.model,
    p_reported_problem: spec.problem,
    p_physical_condition: spec.condition,
    p_accessories_received: spec.accessories,
    p_initial_observation: spec.observation,
    p_diagnosis: spec.diagnosis,
    p_service_mode: spec.mode,
    p_service_mode_details: spec.details,
  });
  assertOk({ error }, "create provider Repair");
  const row = Array.isArray(created) ? created[0] : created;
  if (!row?.repair_id)
    fail(`create provider Repair returned: ${JSON.stringify(created)}`);
  const repairId = row.repair_id;
  const path = ["IN_PROGRESS"];
  for (const step of spec.transitions ?? []) {
    assertOk(
      await owner.rpc("change_repair_status", {
        p_repair_id: repairId,
        p_next_status: step,
      }),
      `transition Repair ${repairId} to ${step}`,
    );
    path.push(step);
  }
  for (const message of spec.updates ?? []) {
    assertOk(
      await owner
        .from("repair_updates")
        .insert({ repair_id: repairId, message }),
      "record Customer Update",
    );
  }
  return {
    repairId,
    trackingCode: row.tracking_code,
    ticket: row.ticket_number,
    status: path.at(-1),
    customer: spec.customerName,
    device: spec.device,
    mode: spec.mode,
  };
}

/**
 * Creates a public Request, then optionally accepts it into a Repair (the
 * Request/Repair seam as the app exercises it) or declines it.
 */
async function seedRequest(owner, provider, spec) {
  const { data: submitted, error } = await admin.rpc("submit_repair_request", {
    p_provider_slug: provider.slug,
    p_customer_name: spec.customerName,
    p_customer_phone: spec.phone,
    p_customer_email: spec.email,
    p_device_type: spec.device,
    p_brand: spec.brand,
    p_model: spec.model,
    p_reported_problem: spec.problem,
    p_preferred_service_mode: spec.mode,
  });
  assertOk({ error }, `submit Request from ${spec.customerName}`);
  const row = Array.isArray(submitted) ? submitted[0] : submitted;
  if (!row?.reference_code)
    fail(`submit_repair_request returned: ${JSON.stringify(submitted)}`);
  // submit returns the public reference_code only; resolve the durable id
  // through the service role like the load harness does.
  const lookup = await admin
    .from("repair_requests")
    .select("id")
    .eq("reference_code", row.reference_code)
    .single();
  assertOk({ error: lookup.error }, `resolve Request ${row.reference_code}`);
  const outcome = { reference: row.reference_code };

  if (spec.outcome === "accepted") {
    assertOk(
      await owner.rpc("create_repair_from_request", {
        p_request_id: lookup.data.id,
        p_customer_name: spec.customerName,
        p_customer_phone: spec.phone,
        p_device_type: spec.device,
        p_reported_problem: spec.problem,
        p_service_mode: spec.mode,
      }),
      `accept Request ${row.reference_code}`,
    );
    outcome.accepted = true;
  } else if (spec.outcome === "declined") {
    assertOk(
      await owner.rpc("decline_repair_request", {
        p_request_id: lookup.data.id,
      }),
      `decline Request ${row.reference_code}`,
    );
    outcome.declined = true;
  }
  return outcome;
}

function hashInvitationToken(email) {
  // The invitations table stores a token hash, never a raw token; UAT cannot
  // mint a joinable link (that is app logic), so these rows demonstrate the
  // expired/revoked presentation states to testers instead.
  return createHash("sha256").update(`uat-${email}`).digest("hex");
}

async function seedInvitation({ provider, invitedBy, email, state }) {
  const expiresAt =
    state === "expired"
      ? new Date(Date.now() - 86_400_000).toISOString()
      : null;
  const revokedAt = state === "revoked" ? new Date().toISOString() : null;
  const { error } = await admin.from("provider_invitations").insert({
    provider_id: provider,
    email,
    role: "STAFF",
    token_hash: hashInvitationToken(email),
    invited_by_user_id: invitedBy.id,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(revokedAt ? { revoked_at: revokedAt } : {}),
  });
  assertOk({ error }, `seed ${state} invitation for ${email}`);
  return { email, state };
}

// ---------------------------------------------------------------- packs

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--cleanup") {
    const manifest = JSON.parse(
      readFileSync(
        path.resolve(argv[1] ?? fail("cleanup requires a manifest path")),
      ),
      "utf8",
    );
    await cleanup(manifest);
    return;
  }

  const manifest = {
    runId,
    generatedAt: new Date().toISOString(),
    appUrl: APP_URL,
    password: PASSWORD,
    note: [
      "Credentials for human UAT testers; do not commit inside a release record.",
      "Re-run from a clean database: `pnpm db:reset`, then seed again.",
      "Reset the whole pack with --cleanup plus `pnpm db:reset`.",
    ],
    users: userIds,
    providers: providerIds,
    personas: [],
  };

  // -- Persona pack 1: one-person Shop -----------------------------------
  const soloOwner = await seedUser("Solo Owner");
  const solo = await seedProvider({
    type: "SHOP",
    name: "Solo Quick Fix",
    modes: ["DROP_OFF", "MEETUP"],
  });
  await seedMembership({
    provider: solo.provider,
    user: soloOwner,
    role: "OWNER",
  });
  const soloOwnerClient = ownerClient(soloOwner);

  manifest.personas.push({
    persona: "Shop Owner (one-person Shop)",
    email: soloOwner.email,
    providerSlug: solo.slug,
    memberRole: "OWNER",
    repairs: [
      await seedRepair(soloOwnerClient, solo, {
        customerName: "Ivy Santos",
        phone: "+63 917 100 2001",
        device: "Laptop",
        brand: "Lenovo",
        model: "IdeaPad 3",
        problem: "Will not power on",
        condition: "Scratched lid",
        observation: "No power LED",
        diagnosis: "Dead charger circuit",
        mode: "DROP_OFF",
        transitions: ["WAITING_FOR_PARTS", "IN_PROGRESS"],
        updates: ["Replaced charging IC; monitoring."],
      }),
      await seedRepair(soloOwnerClient, solo, {
        customerName: "Marco Reyes",
        phone: "+63 917 100 2002",
        device: "Desktop",
        brand: "Generic",
        model: "ITX build",
        problem: "Overheating under load",
        observation: "Dust-clogged fans",
        diagnosis: "Thermal paste is dry",
        mode: "MEETUP",
        transitions: ["READY", "COMPLETED"],
        updates: ["Blow-out and repaste; stress-tested 1h."],
      }),
      await seedRepair(soloOwnerClient, solo, {
        customerName: "Grace Uy",
        phone: "+63 917 100 2003",
        device: "Phone",
        brand: "Samsung",
        model: "A54",
        problem: "Battery drains fast",
        mode: "DROP_OFF",
      }),
    ],
  });
  manifest.personas.at(-1).requests = [
    await seedRequest(soloOwnerClient, solo, {
      customerName: "Bernie Lim",
      phone: "+63 917 200 3001",
      email: `uat.request.bernie.${runId}@uat.test`,
      device: "Laptop",
      brand: "HP",
      model: "Pavilion 14",
      problem: "Hinges broken, screen flickers",
      mode: "DROP_OFF",
      outcome: "accepted",
    }),
    await seedRequest(soloOwnerClient, solo, {
      customerName: "Tita Agnes",
      phone: "+63 917 200 3002",
      email: `uat.request.agnes.${runId}@uat.test`,
      device: "Printer",
      brand: "Epson",
      model: "L3210",
      problem: "Paper feed jams",
      mode: "MEETUP",
      outcome: null,
    }),
    await seedRequest(soloOwnerClient, solo, {
      customerName: "Rico Tan",
      phone: "+63 917 200 3003",
      email: `uat.request.rico.${runId}@uat.test`,
      device: "Console",
      brand: "Sony",
      model: "PS4",
      problem: "HDMI port damaged",
      mode: "DROP_OFF",
      outcome: "declined",
    }),
  ];

  // -- Persona pack 2: multi-Staff Shop ----------------------------------
  const shopOwner = await seedUser("Shop Owner");
  const staff1 = await seedUser("Ana Park");
  const staff2 = await seedUser("Ben Cruz");
  const shop = await seedProvider({
    type: "SHOP",
    name: "Tracknologia Service Center",
    modes: ["DROP_OFF", "MEETUP"],
    address: "123 Main Road, Quezon City",
  });
  await seedMembership({
    provider: shop.provider,
    user: shopOwner,
    role: "OWNER",
  });
  await seedMembership({
    provider: shop.provider,
    user: staff1,
    role: "STAFF",
  });
  await seedMembership({
    provider: shop.provider,
    user: staff2,
    role: "STAFF",
  });
  const shopOwnerClient = ownerClient(shopOwner);
  const staffClient = ownerClient(staff1);

  manifest.personas.push({
    persona: "Shop Owner (multi-Staff Shop)",
    email: shopOwner.email,
    providerSlug: shop.slug,
    memberRole: "OWNER",
    repairStates: "representative of every lifecycle state",
  });
  manifest.personas.at(-1).newStaffEmail = `uat.invite.new.${runId}@uat.test`;
  manifest.personas.at(-1).invitations = [
    await seedInvitation({
      provider: shop.provider,
      invitedBy: shopOwner,
      email: `uat.invite.expired.${runId}@uat.test`,
      state: "expired",
    }),
    await seedInvitation({
      provider: shop.provider,
      invitedBy: shopOwner,
      email: `uat.invite.revoked.${runId}@uat.test`,
      state: "revoked",
    }),
  ];
  manifest.personas.at(-1).staffMembers = [
    {
      persona: "Shop Staff (multi-Staff Shop)",
      email: staff1.email,
      memberRole: "STAFF",
    },
    {
      persona: "Shop Staff 2 (multi-Staff Shop)",
      email: staff2.email,
      memberRole: "STAFF",
    },
  ];
  manifest.personas.at(-1).repairs = [
    await seedRepair(shopOwnerClient, shop, {
      customerName: "Nina Duque",
      phone: "+63 917 400 5001",
      device: "Laptop",
      brand: "Asus",
      model: "TUF A15",
      problem: "Slow and noisy",
      transitions: ["AWAITING_APPROVAL"],
      updates: ["Motherboard repair quoted at 4800 PHP."],
    }),
    await seedRepair(shopOwnerClient, shop, {
      customerName: "Jules Mabini",
      phone: "+63 917 400 5002",
      device: "Phone",
      brand: "Xiaomi",
      model: "Redmi Note 12",
      problem: "Cracked screen",
      mode: "MEETUP",
      transitions: ["READY"],
    }),
    await seedRepair(shopOwnerClient, shop, {
      customerName: "Pao Vergara",
      phone: "+63 917 400 5003",
      device: "Laptop",
      brand: "Apple",
      model: "MacBook Air",
      problem: "Water damage",
      transitions: ["WAITING_FOR_PARTS", "IN_PROGRESS", "READY", "COMPLETED"],
      updates: ["Keyboard and logic board replaced."],
    }),
    await seedRepair(staffClient, shop, {
      customerName: "Calixto Ibarra",
      phone: "+63 917 400 5004",
      device: "Tablet",
      brand: "Samsung",
      model: "Galaxy Tab A8",
      problem: "Charging port loose",
      transitions: ["READY"],
      updates: ["Staff-created direct Repair; port resoldered."],
    }),
  ];
  manifest.personas.at(-1).requests = [
    await seedRequest(shopOwnerClient, shop, {
      customerName: "Dino Recto",
      phone: "+63 917 500 6001",
      email: `uat.request.dino.${runId}@uat.test`,
      device: "Desktop",
      brand: "Dell",
      model: "OptiPlex",
      problem: "No video output",
      mode: "DROP_OFF",
      outcome: "accepted",
    }),
    await seedRequest(shopOwnerClient, shop, {
      customerName: "Wes Sarmiento",
      phone: "+63 917 500 6002",
      email: `uat.request.wes.${runId}@uat.test`,
      device: "Phone",
      brand: "Google",
      model: "Pixel 7",
      problem: "Back camera blurry",
      mode: "MEETUP",
      outcome: null,
    }),
    await seedRequest(shopOwnerClient, shop, {
      customerName: "Marla Panganiban",
      phone: "+63 917 500 6003",
      email: `uat.request.marla.${runId}@uat.test`,
      device: "Laptop",
      brand: "MSI",
      model: "GF63",
      problem: "Fan error at boot",
      mode: "DROP_OFF",
      outcome: null,
    }),
    await seedRequest(shopOwnerClient, shop, {
      customerName: "Jun Fronda",
      phone: "+63 917 500 6004",
      email: `uat.request.jun.${runId}@uat.test`,
      device: "Speaker",
      brand: "JBL",
      model: "Charge 5",
      problem: "Distorted sound",
      mode: "DROP_OFF",
      outcome: "declined",
    }),
  ];

  // -- Persona pack 3: Independent Provider ------------------------------
  const indieOwner = await seedUser("Indie Owner");
  const indie = await seedProvider({
    type: "INDEPENDENT",
    name: "Indy Tech Valet",
    modes: ["MEETUP", "HOME_SERVICE"],
    serviceArea: "Marikina, Antipolo, Cainta",
  });
  await seedMembership({
    provider: indie.provider,
    user: indieOwner,
    role: "OWNER",
  });
  const indieClient = ownerClient(indieOwner);
  manifest.personas.push({
    persona: "Independent Provider",
    email: indieOwner.email,
    providerSlug: indie.slug,
    memberRole: "OWNER",
    repairs: [
      await seedRepair(indieClient, indie, {
        customerName: "Elias Torres",
        phone: "+63 917 700 8001",
        device: "Laptop",
        brand: "Acer",
        model: "Swift 3",
        problem: "Trackpad unresponsive",
        mode: "HOME_SERVICE",
        details: "First floor unit, morning visits only",
        transitions: ["WAITING_FOR_PARTS"],
      }),
      await seedRepair(indieClient, indie, {
        customerName: "Fay Bautista",
        phone: "+63 917 700 8002",
        device: "Phone",
        brand: "OnePlus",
        model: "Nord CE",
        problem: "Does not hold charge",
        mode: "MEETUP",
        details: "SM Marikina parking, weekends",
        transitions: ["READY", "COMPLETED"],
        updates: [
          "Battery swap complete; verified 500 cycles below threshold.",
        ],
      }),
    ],
  });
  manifest.personas.at(-1).requests = [
    await seedRequest(indieClient, indie, {
      customerName: "Gina Lapid",
      phone: "+63 917 800 9001",
      email: `uat.request.gina.${runId}@uat.test`,
      device: "Laptop",
      brand: "Huawei",
      model: "MateBook D15",
      problem: "Keyboard keys stick",
      mode: "HOME_SERVICE",
      outcome: "accepted",
    }),
  ];

  // -- Persona pack 4: closed intake -------------------------------------
  const closedOwner = await seedUser("Closed Owner");
  const closed = await seedProvider({
    type: "SHOP",
    name: "Cool Creek Tech (closed)",
    modes: ["DROP_OFF"],
    accepting: false,
    address: "45 Industrial Ave, Pasig",
  });
  await seedMembership({
    provider: closed.provider,
    user: closedOwner,
    role: "OWNER",
  });
  const closedClient = ownerClient(closedOwner);
  manifest.personas.push({
    persona: "Shop Owner (closed intake)",
    email: closedOwner.email,
    providerSlug: closed.slug,
    memberRole: "OWNER",
    note: "Request intake is closed; new public Requests must be presented as unavailable.",
    repairs: [
      await seedRepair(closedClient, closed, {
        customerName: "Old Customer Gab",
        phone: "+63 917 900 0001",
        device: "Laptop",
        brand: "Acer",
        model: "Aspire 5",
        problem: "Corner dent; screen OK",
        transitions: ["READY"],
      }),
    ],
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const manifestPath = path.join(OUTPUT_DIR, `uat-manifest-${runId}.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(
    `[UAT seed] Pack seeded.\n` +
      `  Manifest: ${manifestPath}\n` +
      `  App URL:  ${APP_URL}\n` +
      `  Password: ${PASSWORD}\n` +
      `  Personas: ${manifest.personas.length} (one-person Shop, multi-Staff Shop, Independent, closed intake)`,
  );
}

// ---------------------------------------------------------------- cleanup

async function cleanup(manifest) {
  // Old manifests cannot safely identify their users; reset the disposable stack instead.
  if (
    !/^[0-9a-f]{8}$/.test(manifest.runId ?? "") ||
    !Array.isArray(manifest.users) ||
    !manifest.users.length ||
    !Array.isArray(manifest.providers) ||
    !manifest.providers.length
  ) {
    fail("Invalid or legacy manifest; use pnpm db:reset instead of cleanup");
  }
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    manifest.users.some(
      (user) =>
        !uuid.test(user.id ?? "") ||
        !user.email?.startsWith("uat.") ||
        !user.email.endsWith(`.${manifest.runId}@uat.test`),
    ) ||
    manifest.providers.some(
      (provider) =>
        !uuid.test(provider.id ?? "") ||
        !provider.slug?.endsWith(`-${manifest.runId}`),
    )
  ) {
    fail("Invalid manifest identities; refusing cleanup");
  }
  const userIdList = manifest.users.map((user) => user.id);
  const providerIdList = manifest.providers.map((provider) => provider.id);
  const providers = await admin
    .from("providers")
    .select("id, slug")
    .in("id", providerIdList);
  assertOk(providers, "read providers for cleanup");
  if (
    providers.data.some(
      (row) =>
        !manifest.providers.some(
          (provider) => provider.id === row.id && provider.slug === row.slug,
        ),
    )
  ) {
    fail("Provider identity does not match the manifest");
  }
  const existingUsers = [];
  for (const user of manifest.users) {
    const result = await admin.auth.admin.getUserById(user.id);
    if (result.error?.status === 404) continue;
    assertOk(result, "read user for cleanup");
    if (!result.data.user || result.data.user.email !== user.email)
      fail("User identity does not match the manifest");
    existingUsers.push(user);
  }
  const memberships = await admin
    .from("provider_memberships")
    .select("user_id, provider_id")
    .in("user_id", userIdList);
  assertOk(memberships, "read memberships for cleanup");
  if (
    memberships.data.some(
      (membership) => !providerIdList.includes(membership.provider_id),
    )
  ) {
    fail("A manifest user belongs to another Provider; refusing cleanup");
  }
  assertOk(
    await admin.from("provider_memberships").delete().in("user_id", userIdList),
    "delete UAT memberships",
  );
  assertOk(
    await admin
      .from("provider_user_profiles")
      .delete()
      .in("user_id", userIdList),
    "delete UAT profiles",
  );
  assertOk(
    await admin.from("providers").delete().in("id", providerIdList),
    "delete UAT providers",
  );
  for (const user of existingUsers) {
    assertOk(
      await admin.auth.admin.deleteUser(user.id),
      `delete user ${user.email}`,
    );
  }
  console.log(
    `[UAT seed] Cleaned ${providers.data.length} providers and ${existingUsers.length} users.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
