// Public Interface for src/features/providers
export {
  createProvider,
  createStaffInvitation,
  acceptStaffInvitation,
  revokeStaffInvitation,
  type CreateStaffInvitationResult,
} from "./commands";

export {
  getProvider,
  getPublicProvider,
  getInvitationForOnboarding,
  listTeamMembers,
  listPendingStaffInvitations,
  getProviderUserProfile,
} from "./queries";

export {
  providerTypeEnum,
  createIndependentProviderSchema,
  createShopProviderSchema,
  staffInvitationSchema,
  acceptStaffInvitationSchema,
  type CreateIndependentProviderInput,
  type CreateShopProviderInput,
  type StaffInvitationInput,
  type AcceptStaffInvitationSchemaInput,
} from "./schemas";

export type {
  Provider,
  PublicProviderProfile,
  ProviderUserProfile,
  ProviderMembership,
  ProviderInvitation,
  ProviderType,
  MembershipRole,
  TeamMember,
  CreateProviderInput,
  AcceptStaffInvitationInput,
  InvitationShopDetails,
} from "./types";

