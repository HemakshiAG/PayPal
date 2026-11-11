import { z } from "zod";

export const createTransactionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title cannot exceed 120 characters"),
  category: z
    .string()
    .trim()
    .min(2, "Category is required")
    .max(60, "Category cannot exceed 60 characters"),
  description: z
    .string()
    .trim()
    .max(2000, "Description cannot exceed 2000 characters")
    .optional()
    .or(z.literal("")),
  userRole: z.enum(["buyer", "seller"]),
  targetBudget: z.coerce
    .number()
    .positive("Target budget must be greater than 0"),
  currency: z.string().trim().default("INR"),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const joinTransactionSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(6, "Invite code must be at least 6 characters")
    .max(16, "Invalid invite code format")
    .toUpperCase(),
});

export type JoinTransactionInput = z.infer<typeof joinTransactionSchema>;
