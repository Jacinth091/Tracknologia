import { z } from "zod";

export const providerTypeSchema = z.enum(["SHOP", "INDEPENDENT"]);

export const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
  .object({
    email: z.string().trim().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
