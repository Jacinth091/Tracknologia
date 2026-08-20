import { z } from "zod";

export const providerTypeEnum = z.enum(["SHOP", "INDEPENDENT"]);

export const createIndependentProviderSchema = z.object({
  displayName: z.string().trim().min(2, "Name or repair brand must be at least 2 characters"),
  contactEmail: z.string().trim().email("Please enter a valid email address").optional(),
  contactPhone: z.string().trim().optional(),
  serviceArea: z.string().trim().optional(),
  supportedDevices: z.array(z.string()).default([]),
});

export const createShopProviderSchema = z.object({
  displayName: z.string().trim().min(2, "Shop name must be at least 2 characters"),
  contactEmail: z.string().trim().email("Please enter a valid email address").optional(),
  contactPhone: z.string().trim().optional(),
  publicAddress: z.string().trim().optional(),
  serviceArea: z.string().trim().optional(),
  supportedDevices: z.array(z.string()).default([]),
});

export const staffInvitationSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address to invite"),
});

export type CreateIndependentProviderInput = z.infer<typeof createIndependentProviderSchema>;
export type CreateShopProviderInput = z.infer<typeof createShopProviderSchema>;
export type StaffInvitationInput = z.infer<typeof staffInvitationSchema>;
