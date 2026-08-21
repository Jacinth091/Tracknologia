import { z } from "zod";

export const providerTypeEnum = z.enum(["SHOP", "INDEPENDENT"]);

export const createIndependentProviderSchema = z.object({
  ownerName: z.string().trim().min(2, "Your full name must be at least 2 characters"),
  displayName: z.string().trim().min(2, "Repair brand name must be at least 2 characters"),
  contactEmail: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .optional()
    .or(z.literal("")),
  contactPhone: z.string().trim().optional(),
  serviceArea: z.string().trim().optional(),
  supportedDevices: z.array(z.string()).default([]),
});

export const createShopProviderSchema = z.object({
  ownerName: z.string().trim().min(2, "Your full name must be at least 2 characters"),
  displayName: z.string().trim().min(2, "Shop name must be at least 2 characters"),
  contactEmail: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .optional()
    .or(z.literal("")),
  contactPhone: z.string().trim().optional(),
  publicAddress: z.string().trim().optional(),
  serviceArea: z.string().trim().optional(),
  supportedDevices: z.array(z.string()).default([]),
});

export const staffInvitationSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address to invite"),
});

export const acceptStaffInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),
  displayName: z.string().trim().min(2, "Please enter your full name (at least 2 characters)"),
  contactPhone: z.string().trim().optional(),
});

export type CreateIndependentProviderInput = z.infer<typeof createIndependentProviderSchema>;
export type CreateShopProviderInput = z.infer<typeof createShopProviderSchema>;
export type StaffInvitationInput = z.infer<typeof staffInvitationSchema>;
export type AcceptStaffInvitationSchemaInput = z.infer<typeof acceptStaffInvitationSchema>;

