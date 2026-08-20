// Public Interface for src/features/providers
export {
  createProviderWithOwner,
  acceptStaffInvitation,
  createStaffInvitation,
  listStaffInvitations,
  listTeamMembers,
  revokeStaffInvitation,
  getProviderById,
} from "./persistence";

export {
  createIndependentProviderSchema,
  createShopProviderSchema,
  staffInvitationSchema,
  type CreateIndependentProviderInput,
  type CreateShopProviderInput,
  type StaffInvitationInput,
} from "./schemas";

export type {
  Provider,
  ProviderInvitation,
  ProviderType,
  MembershipRole,
  TeamMember,
  CreateProviderInput,
} from "./types";
