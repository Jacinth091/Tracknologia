import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

import { hashInvitationToken } from "@/features/providers/persistence";
import {
  cleanupFixture,
  createAdminClient,
  createAnonClient,
  createTestUser,
  requireDbConfig,
  signInTestUser,
  uniqueEmail,
  uniqueName,
} from "./helpers/supabase-test-context";

type ProviderType = "SHOP" | "INDEPENDENT";

const password = "TestPassword123!";

requireDbConfig();

async function createProviderAs(
  client: SupabaseClient,
  params: {
    displayName?: string;
    providerType?: ProviderType | null;
    ownerDisplayName?: string | null;
    contactEmail?: string | null;
  } = {},
): Promise<{ providerId: string; membershipId: string; slug: string }> {
  const { data, error } = await client.rpc("create_provider_with_owner", {
    p_display_name: params.displayName ?? uniqueName("Provider"),
    p_provider_type: params.providerType ?? "SHOP",
    p_owner_display_name: params.ownerDisplayName ?? uniqueName("Owner"),
    p_owner_contact_phone: null,
    p_contact_email: params.contactEmail ?? null,
    p_contact_phone: null,
    p_public_address: null,
    p_service_area: null,
    p_supported_devices: [],
  });

  if (error) {
    throw new Error(`create_provider_with_owner failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    providerId: row.provider_id,
    membershipId: row.membership_id,
    slug: row.slug,
  };
}

async function createInvitationAs(
  client: SupabaseClient,
  email = uniqueEmail("staff"),
): Promise<{ invitationId: string; email: string; tokenHash: string }> {
  const tokenHash = hashInvitationToken(`inv_${randomUUID()}_${randomUUID()}`);
  const { data, error } = await client.rpc("create_staff_invitation", {
    p_email: email,
    p_token_hash: tokenHash,
  });

  if (error) {
    throw new Error(`create_staff_invitation failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    invitationId: row.invitation_id,
    email: row.email,
    tokenHash,
  };
}

async function acceptInvitationAs(
  client: SupabaseClient,
  tokenHash: string,
  displayName = uniqueName("Staff"),
) {
  return client.rpc("accept_staff_invitation", {
    p_token_hash: tokenHash,
    p_display_name: displayName,
    p_contact_phone: null,
  });
}

describe("PostgreSQL Real Database, RPCs & RLS Integration Suite (AUTH-R28)", () => {
  let adminClient: SupabaseClient;
  let anonClient: SupabaseClient;

  beforeAll(() => {
    adminClient = createAdminClient();
    anonClient = createAnonClient();
  });

  it("anon cannot SELECT raw providers, but can SELECT the public projection without private fields", async () => {
    const raw = await anonClient.from("providers").select("*");
    expect(raw.error).not.toBeNull();
    expect(raw.data).toBeNull();

    const projection = await anonClient
      .from("public_provider_profiles")
      .select("*")
      .limit(1);
    expect(projection.error).toBeNull();
    if (projection.data && projection.data.length > 0) {
      expect(projection.data[0]).not.toHaveProperty("contact_phone");
      expect(projection.data[0]).not.toHaveProperty("contact_email");
      expect(projection.data[0]).toHaveProperty("display_name");
      expect(projection.data[0]).toHaveProperty("accepting_requests");
    }
  });

  it("Provider A can access its own Provider but cannot read or mutate Provider B", async () => {
    const userA = await createTestUser(
      adminClient,
      uniqueEmail("owner-a"),
      password,
    );
    const userB = await createTestUser(
      adminClient,
      uniqueEmail("owner-b"),
      password,
    );
    const authA = await signInTestUser(userA.email, password);
    const authB = await signInTestUser(userB.email, password);
    const createdProviderIds: string[] = [];

    try {
      const providerA = await createProviderAs(authA.client, {
        displayName: uniqueName("Alpha Shop"),
      });
      const providerB = await createProviderAs(authB.client, {
        displayName: uniqueName("Beta Shop"),
      });
      createdProviderIds.push(providerA.providerId, providerB.providerId);

      const ownRead = await authA.client
        .from("providers")
        .select("id")
        .eq("id", providerA.providerId)
        .single();
      expect(ownRead.error).toBeNull();
      expect(ownRead.data?.id).toBe(providerA.providerId);

      const crossRead = await authA.client
        .from("providers")
        .select("id")
        .eq("id", providerB.providerId);
      expect(crossRead.error).toBeNull();
      expect(crossRead.data).toEqual([]);

      const attemptedName = uniqueName("Hijacked Shop");
      const crossUpdate = await authA.client
        .from("providers")
        .update({ display_name: attemptedName })
        .eq("id", providerB.providerId)
        .select("id");
      expect(crossUpdate.error).toBeNull();
      expect(crossUpdate.data).toEqual([]);

      const durable = await adminClient
        .from("providers")
        .select("display_name")
        .eq("id", providerB.providerId)
        .single();
      expect(durable.error).toBeNull();
      expect(durable.data?.display_name).not.toBe(attemptedName);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [userA.user.id, userB.user.id],
      });
    }
  });

  it("authenticated users cannot direct-insert provider memberships or self-promote to OWNER", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const attacker = await createTestUser(
      adminClient,
      uniqueEmail("attacker"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const attackerAuth = await signInTestUser(attacker.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(ownerAuth.client);
      createdProviderIds.push(provider.providerId);

      for (const role of ["STAFF", "OWNER"] as const) {
        const insert = await attackerAuth.client
          .from("provider_memberships")
          .insert({
            provider_id: provider.providerId,
            user_id: attacker.user.id,
            role,
          });
        expect(insert.error).not.toBeNull();
      }

      const durable = await adminClient
        .from("provider_memberships")
        .select("id")
        .eq("provider_id", provider.providerId)
        .eq("user_id", attacker.user.id);
      expect(durable.error).toBeNull();
      expect(durable.data).toEqual([]);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, attacker.user.id],
      });
    }
  });

  it("SHOP Owner can create Staff invitation; INDEPENDENT Owner cannot", async () => {
    const shopOwner = await createTestUser(
      adminClient,
      uniqueEmail("shop-owner"),
      password,
    );
    const independentOwner = await createTestUser(
      adminClient,
      uniqueEmail("independent-owner"),
      password,
    );
    const shopAuth = await signInTestUser(shopOwner.email, password);
    const independentAuth = await signInTestUser(
      independentOwner.email,
      password,
    );
    const createdProviderIds: string[] = [];

    try {
      const shop = await createProviderAs(shopAuth.client, {
        providerType: "SHOP",
      });
      const independent = await createProviderAs(independentAuth.client, {
        providerType: "INDEPENDENT",
      });
      createdProviderIds.push(shop.providerId, independent.providerId);

      const invite = await createInvitationAs(shopAuth.client);
      const row = await adminClient
        .from("provider_invitations")
        .select("provider_id, email, role, token_hash")
        .eq("id", invite.invitationId)
        .single();
      expect(row.error).toBeNull();
      expect(row.data).toMatchObject({
        provider_id: shop.providerId,
        email: invite.email,
        role: "STAFF",
        token_hash: invite.tokenHash,
      });
      expect(row.data?.token_hash).toMatch(/^[a-f0-9]{64}$/);

      const deniedTokenHash = hashInvitationToken(
        `inv_${randomUUID()}_${randomUUID()}`,
      );
      const denied = await independentAuth.client.rpc(
        "create_staff_invitation",
        {
          p_email: uniqueEmail("denied-staff"),
          p_token_hash: deniedTokenHash,
        },
      );
      expect(denied.error).not.toBeNull();

      const deniedRows = await adminClient
        .from("provider_invitations")
        .select("id")
        .eq("token_hash", deniedTokenHash);
      expect(deniedRows.data).toEqual([]);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [shopOwner.user.id, independentOwner.user.id],
      });
    }
  });

  it("Owner cannot direct-update invitation lifecycle fields, while narrow revoke succeeds", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(auth.client);
      createdProviderIds.push(provider.providerId);
      const invite = await createInvitationAs(auth.client);

      const before = await adminClient
        .from("provider_invitations")
        .select("*")
        .eq("id", invite.invitationId)
        .single();
      expect(before.error).toBeNull();

      const direct = await auth.client
        .from("provider_invitations")
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by_user_id: owner.user.id,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          token_hash: hashInvitationToken(`inv_${randomUUID()}`),
          provider_id: provider.providerId,
          revoked_at: new Date().toISOString(),
        })
        .eq("id", invite.invitationId)
        .select("id");
      expect(direct.error).not.toBeNull();

      const afterDirect = await adminClient
        .from("provider_invitations")
        .select("*")
        .eq("id", invite.invitationId)
        .single();
      expect(afterDirect.data).toMatchObject({
        accepted_at: before.data?.accepted_at,
        accepted_by_user_id: before.data?.accepted_by_user_id,
        expires_at: before.data?.expires_at,
        token_hash: before.data?.token_hash,
        provider_id: before.data?.provider_id,
        revoked_at: before.data?.revoked_at,
      });

      const revoked = await auth.client.rpc("revoke_staff_invitation", {
        p_invitation_id: invite.invitationId,
      });
      expect(revoked.error).toBeNull();
      expect(revoked.data).toBe(true);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id],
      });
    }
  });

  it("invitation acceptance rejects revoked, expired, consumed, wrong-email, and existing-member cases without partial state", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("staff"),
      password,
    );
    const wrongEmailUser = await createTestUser(
      adminClient,
      uniqueEmail("wrong"),
      password,
    );
    const existingMember = await createTestUser(
      adminClient,
      uniqueEmail("existing"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const wrongAuth = await signInTestUser(wrongEmailUser.email, password);
    const existingAuth = await signInTestUser(existingMember.email, password);
    const createdProviderIds: string[] = [];
    const createdUserIds = [
      owner.user.id,
      staff.user.id,
      wrongEmailUser.user.id,
      existingMember.user.id,
    ];

    try {
      const provider = await createProviderAs(ownerAuth.client, {
        displayName: uniqueName("Invite Shop"),
      });
      const existingProvider = await createProviderAs(existingAuth.client, {
        displayName: uniqueName("Existing Shop"),
      });
      createdProviderIds.push(provider.providerId, existingProvider.providerId);

      const revoked = await createInvitationAs(ownerAuth.client, staff.email);
      await ownerAuth.client.rpc("revoke_staff_invitation", {
        p_invitation_id: revoked.invitationId,
      });
      const revokedAccept = await acceptInvitationAs(
        staffAuth.client,
        revoked.tokenHash,
      );
      expect(revokedAccept.error).not.toBeNull();

      const expired = await createInvitationAs(ownerAuth.client, staff.email);
      await adminClient
        .from("provider_invitations")
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", expired.invitationId);
      const expiredAccept = await acceptInvitationAs(
        staffAuth.client,
        expired.tokenHash,
      );
      expect(expiredAccept.error).not.toBeNull();

      const wrongEmail = await createInvitationAs(
        ownerAuth.client,
        staff.email,
      );
      const wrongEmailAccept = await acceptInvitationAs(
        wrongAuth.client,
        wrongEmail.tokenHash,
      );
      expect(wrongEmailAccept.error).not.toBeNull();

      const existing = await createInvitationAs(
        ownerAuth.client,
        existingMember.email,
      );
      const existingAccept = await acceptInvitationAs(
        existingAuth.client,
        existing.tokenHash,
      );
      expect(existingAccept.error).not.toBeNull();

      const consumed = await createInvitationAs(ownerAuth.client, staff.email);
      const firstAccept = await acceptInvitationAs(
        staffAuth.client,
        consumed.tokenHash,
      );
      expect(firstAccept.error).toBeNull();
      const secondUser = await createTestUser(
        adminClient,
        uniqueEmail("second-staff"),
        password,
      );
      createdUserIds.push(secondUser.user.id);
      const secondAuth = await signInTestUser(secondUser.email, password);
      await adminClient
        .from("provider_invitations")
        .update({ email: secondUser.email })
        .eq("id", consumed.invitationId);
      const secondAccept = await acceptInvitationAs(
        secondAuth.client,
        consumed.tokenHash,
      );
      expect(secondAccept.error).not.toBeNull();

      const rows = await adminClient
        .from("provider_memberships")
        .select("id, user_id")
        .eq("provider_id", provider.providerId);
      expect(rows.error).toBeNull();
      expect(
        rows.data?.filter((row) => row.user_id === staff.user.id),
      ).toHaveLength(1);
      expect(
        rows.data?.filter((row) => row.user_id === wrongEmailUser.user.id),
      ).toHaveLength(0);
      expect(
        rows.data?.filter((row) => row.user_id === existingMember.user.id),
      ).toHaveLength(0);
      expect(
        rows.data?.filter((row) => row.user_id === secondUser.user.id),
      ).toHaveLength(0);

      const states = await adminClient
        .from("provider_invitations")
        .select("id, accepted_at, accepted_by_user_id")
        .in("id", [
          revoked.invitationId,
          expired.invitationId,
          wrongEmail.invitationId,
          existing.invitationId,
        ]);
      expect(states.error).toBeNull();
      expect(
        states.data?.every(
          (row) => row.accepted_at === null && row.accepted_by_user_id === null,
        ),
      ).toBe(true);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: createdUserIds,
      });
    }
  });

  it("two concurrent Staff invite accepts for one User create exactly one membership and consume one invitation", async () => {
    const ownerA = await createTestUser(
      adminClient,
      uniqueEmail("owner-a"),
      password,
    );
    const ownerB = await createTestUser(
      adminClient,
      uniqueEmail("owner-b"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("race-staff"),
      password,
    );
    const ownerAAuth = await signInTestUser(ownerA.email, password);
    const ownerBAuth = await signInTestUser(ownerB.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const createdProviderIds: string[] = [];

    try {
      const providerA = await createProviderAs(ownerAAuth.client, {
        displayName: uniqueName("Race A"),
      });
      const providerB = await createProviderAs(ownerBAuth.client, {
        displayName: uniqueName("Race B"),
      });
      createdProviderIds.push(providerA.providerId, providerB.providerId);
      const inviteA = await createInvitationAs(ownerAAuth.client, staff.email);
      const inviteB = await createInvitationAs(ownerBAuth.client, staff.email);

      const results = await Promise.allSettled([
        acceptInvitationAs(staffAuth.client, inviteA.tokenHash),
        acceptInvitationAs(staffAuth.client, inviteB.tokenHash),
      ]);
      const fulfilled = results.filter(
        (result) => result.status === "fulfilled" && !result.value.error,
      );
      const rejected = results.filter(
        (result) =>
          result.status === "rejected" ||
          (result.status === "fulfilled" && result.value.error),
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const memberships = await adminClient
        .from("provider_memberships")
        .select("id")
        .eq("user_id", staff.user.id);
      expect(memberships.data).toHaveLength(1);

      const invitations = await adminClient
        .from("provider_invitations")
        .select("id, accepted_at")
        .in("id", [inviteA.invitationId, inviteB.invitationId]);
      expect(
        invitations.data?.filter((row) => row.accepted_at !== null),
      ).toHaveLength(1);
      expect(
        invitations.data?.filter((row) => row.accepted_at === null),
      ).toHaveLength(1);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [ownerA.user.id, ownerB.user.id, staff.user.id],
      });
    }
  });

  it("Provider-create vs Staff-accept race creates exactly one membership and no orphan losing state", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const candidate = await createTestUser(
      adminClient,
      uniqueEmail("candidate"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const candidateAuth = await signInTestUser(candidate.email, password);
    const createdProviderIds: string[] = [];
    const candidateProviderName = uniqueName("Candidate Provider");

    try {
      const shop = await createProviderAs(ownerAuth.client, {
        displayName: uniqueName("Race Invite Shop"),
      });
      createdProviderIds.push(shop.providerId);
      const invite = await createInvitationAs(
        ownerAuth.client,
        candidate.email,
      );

      const results = await Promise.allSettled([
        createProviderAs(candidateAuth.client, {
          displayName: candidateProviderName,
          providerType: "INDEPENDENT",
          ownerDisplayName: uniqueName("Candidate Owner"),
        }),
        acceptInvitationAs(candidateAuth.client, invite.tokenHash),
      ]);
      const successes = results.filter(
        (result) =>
          result.status === "fulfilled" &&
          !("error" in result.value && result.value.error),
      );
      const failures = results.filter(
        (result) =>
          result.status === "rejected" ||
          (result.status === "fulfilled" &&
            "error" in result.value &&
            result.value.error),
      );
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      const memberships = await adminClient
        .from("provider_memberships")
        .select("provider_id")
        .eq("user_id", candidate.user.id);
      expect(memberships.data).toHaveLength(1);

      const candidateProviders = await adminClient
        .from("providers")
        .select("id")
        .eq("display_name", candidateProviderName);
      if (
        memberships.data?.[0]?.provider_id !== candidateProviders.data?.[0]?.id
      ) {
        expect(candidateProviders.data).toEqual([]);
      }

      const invitation = await adminClient
        .from("provider_invitations")
        .select("accepted_at")
        .eq("id", invite.invitationId)
        .single();
      const membershipProviderId = memberships.data?.[0]?.provider_id;
      if (membershipProviderId === shop.providerId) {
        expect(invitation.data?.accepted_at).not.toBeNull();
      } else {
        expect(invitation.data?.accepted_at).toBeNull();
        if (membershipProviderId) {
          createdProviderIds.push(membershipProviderId);
        }
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, candidate.user.id],
      });
    }
  });

  it("Provider onboarding failures leave no Provider, profile, or OWNER membership", async () => {
    const user = await createTestUser(
      adminClient,
      uniqueEmail("atomic-owner"),
      password,
    );
    const auth = await signInTestUser(user.email, password);
    const displayName = uniqueName("Atomic Failure Provider");

    try {
      const failed = await auth.client.rpc("create_provider_with_owner", {
        p_display_name: displayName,
        p_provider_type: null,
        p_owner_display_name: uniqueName("Atomic Owner"),
        p_owner_contact_phone: null,
        p_contact_email: null,
        p_contact_phone: null,
        p_public_address: null,
        p_service_area: null,
        p_supported_devices: [],
      });
      expect(failed.error).not.toBeNull();

      const providers = await adminClient
        .from("providers")
        .select("id")
        .eq("display_name", displayName);
      const profiles = await adminClient
        .from("provider_user_profiles")
        .select("user_id")
        .eq("user_id", user.user.id);
      const memberships = await adminClient
        .from("provider_memberships")
        .select("id")
        .eq("user_id", user.user.id);
      expect(providers.data).toEqual([]);
      expect(profiles.data).toEqual([]);
      expect(memberships.data).toEqual([]);
    } finally {
      await cleanupFixture(adminClient, { userIds: [user.user.id] });
    }
  });

  it("Staff acceptance failure leaves no Staff membership, profile mutation, or consumed invitation", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("atomic-staff"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const createdProviderIds: string[] = [];

    try {
      const shop = await createProviderAs(ownerAuth.client, {
        providerType: "SHOP",
      });
      createdProviderIds.push(shop.providerId);
      const invite = await createInvitationAs(ownerAuth.client, staff.email);
      await adminClient
        .from("providers")
        .update({ provider_type: "INDEPENDENT" })
        .eq("id", shop.providerId);

      const failed = await acceptInvitationAs(
        staffAuth.client,
        invite.tokenHash,
      );
      expect(failed.error).not.toBeNull();

      const memberships = await adminClient
        .from("provider_memberships")
        .select("id")
        .eq("user_id", staff.user.id);
      const profiles = await adminClient
        .from("provider_user_profiles")
        .select("user_id")
        .eq("user_id", staff.user.id);
      const invitation = await adminClient
        .from("provider_invitations")
        .select("accepted_at, accepted_by_user_id")
        .eq("id", invite.invitationId)
        .single();
      expect(memberships.data).toEqual([]);
      expect(profiles.data).toEqual([]);
      expect(invitation.data).toMatchObject({
        accepted_at: null,
        accepted_by_user_id: null,
      });
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, staff.user.id],
      });
    }
  });

  it("unauthenticated create_provider_with_owner and direct blank required names fail", async () => {
    const unauthenticated = await anonClient.rpc("create_provider_with_owner", {
      p_display_name: "Test Shop",
      p_provider_type: "SHOP",
      p_owner_display_name: "Owner Name",
      p_owner_contact_phone: null,
      p_contact_email: null,
      p_contact_phone: null,
      p_public_address: null,
      p_service_area: null,
      p_supported_devices: [],
    });
    expect(unauthenticated.error).not.toBeNull();
    expect(unauthenticated.error?.message).toMatch(/Authentication required/i);

    const user = await createTestUser(
      adminClient,
      uniqueEmail("blank-owner"),
      password,
    );
    const auth = await signInTestUser(user.email, password);

    try {
      const blankOwner = await auth.client.rpc("create_provider_with_owner", {
        p_display_name: uniqueName("Blank Owner Shop"),
        p_provider_type: "SHOP",
        p_owner_display_name: " ",
        p_owner_contact_phone: null,
        p_contact_email: null,
        p_contact_phone: null,
        p_public_address: null,
        p_service_area: null,
        p_supported_devices: [],
      });
      expect(blankOwner.error).not.toBeNull();
      expect(blankOwner.error?.message).toMatch(
        /Owner display name cannot be blank/i,
      );
    } finally {
      await cleanupFixture(adminClient, { userIds: [user.user.id] });
    }
  });

  it("slug collision path produces distinct durable slugs under concurrent Provider creation", async () => {
    const userA = await createTestUser(
      adminClient,
      uniqueEmail("slug-a"),
      password,
    );
    const userB = await createTestUser(
      adminClient,
      uniqueEmail("slug-b"),
      password,
    );
    const authA = await signInTestUser(userA.email, password);
    const authB = await signInTestUser(userB.email, password);
    const providerName = uniqueName("Same Slug Shop");
    const createdProviderIds: string[] = [];

    try {
      const results = await Promise.all([
        createProviderAs(authA.client, {
          displayName: providerName,
          ownerDisplayName: uniqueName("Owner A"),
        }),
        createProviderAs(authB.client, {
          displayName: providerName,
          ownerDisplayName: uniqueName("Owner B"),
        }),
      ]);
      createdProviderIds.push(...results.map((result) => result.providerId));

      expect(results[0].slug).not.toBe(results[1].slug);
      expect(new Set(results.map((result) => result.slug)).size).toBe(2);

      const durable = await adminClient
        .from("providers")
        .select("slug")
        .in("id", createdProviderIds);
      expect(durable.data?.map((row) => row.slug).sort()).toEqual(
        results.map((result) => result.slug).sort(),
      );
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [userA.user.id, userB.user.id],
      });
    }
  });
});
