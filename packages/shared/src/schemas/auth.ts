import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const totpVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d+$/),
  preAuthToken: z.string().min(32),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8),
});
