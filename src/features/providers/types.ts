export type ProviderType = "SHOP" | "INDEPENDENT";
export type MembershipRole = "OWNER" | "STAFF";

export interface Provider {
  id: string;
  providerType: ProviderType;
  displayName: string;
  slug: string;
  description?: string | null;
  profileImageUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  publicAddress?: string | null;
  serviceArea?: string | null;
  supportedDevices: string[];
  acceptingRequests: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInvitation {
  id: string;
  providerId: string;
  email: string;
  role: MembershipRole;
  tokenHash: string;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  revokedAt?: string | null;
}

export interface TeamMember {
  membershipId: string;
  userId: string;
  role: MembershipRole;
  displayName: string;
  email: string | null;
  contactPhone?: string | null;
  createdAt: string;
}

export interface CreateProviderInput {
  displayName: string;
  providerType: ProviderType;
  contactEmail?: string;
  contactPhone?: string;
  publicAddress?: string;
  serviceArea?: string;
  supportedDevices?: string[];
}
