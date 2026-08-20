export type ProviderRole = "OWNER" | "STAFF";
export type ProviderType = "SHOP" | "INDEPENDENT";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface ProviderMembership {
  id: string;
  providerId: string;
  userId: string;
  role: ProviderRole;
  createdAt: string;
}

export interface ProviderContext {
  userId: string;
  providerId: string;
  providerName: string;
  providerType: ProviderType;
  role: ProviderRole;
  email: string | null;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: "UNAUTHENTICATED" | "NO_MEMBERSHIP" | "UNAUTHORIZED_ROLE" | "INVALID_CREDENTIALS",
  ) {
    super(message);
    this.name = "AuthError";
  }
}
