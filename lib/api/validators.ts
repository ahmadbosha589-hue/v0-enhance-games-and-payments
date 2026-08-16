import { z } from "zod"

export const claimRequestSchema = z.object({
  captchaToken: z.string().optional(),
  fingerprint: z
    .object({
      visitorId: z.string().min(1),
      browserName: z.string().optional(),
      browserVersion: z.string().optional(),
      osName: z.string().optional(),
      osVersion: z.string().optional(),
      deviceType: z.string().optional(),
      screenResolution: z.string().optional(),
      timezone: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
  // Client-side VPN detection data
  webrtcIPs: z.array(z.string()).optional(),
  clientTimezone: z.string().optional(),
  clientLanguage: z.string().optional(),
  screenResolution: z.string().optional(),
  // Enhanced security fields - server validates all of these
  behaviorScore: z.number().min(0).max(100).optional(),
  verificationDuration: z.number().optional(),
  mouseMovements: z.number().optional(),
  clickCount: z.number().optional(),
  hardwareConcurrency: z.number().optional(),
  deviceMemory: z.number().optional(),
  pluginCount: z.number().optional(),
  touchSupport: z.boolean().optional(),
  canvasHash: z.string().optional(),
  webglVendor: z.string().optional(),
  webglRenderer: z.string().optional(),
  audioHash: z.string().optional(),
  detectedThreats: z.array(z.string()).optional(),
  threatLevel: z.enum(["none", "low", "medium", "high", "critical"]).optional(),
  // v3.0 enhanced security fields
  correlatedThreats: z.array(z.string()).optional(),
  automationDetected: z.boolean().optional(),
  userscriptDetected: z.boolean().optional(),
  devtoolsDetected: z.boolean().optional(),
  proofOfWorkNonce: z.string().optional(),
  proofOfWorkHash: z.string().optional(),
  connectionType: z.string().optional(),
  effectiveType: z.string().optional(),
  downlink: z.number().optional(),
  rtt: z.number().optional(),
})

export const withdrawalRequestSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.enum([
    "BTC",
    "LTC",
    "DOGE",
    "ETH",
    "BCH",
    "DASH",
    "DGB",
    "TRX",
    "USDT",
    "FEY",
    "ZEC",
    "BNB",
    "SOL",
    "XRP",
    "MATIC",
    "TON",
  ]),
})

export const profileUpdateSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  faucetpay_email: z.string().email().optional().nullable(),
})

export const contactFormSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  subject: z.string().min(5).max(200),
  message: z.string().min(10).max(5000),
})

export const adminUserActionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["ban", "unban", "flag", "unflag", "reset_fraud_score", "adjust_balance"]),
  reason: z.string().min(1).max(500).optional(),
  amount: z.number().int().optional(),
})

export const adminBulkActionSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["ban", "unban", "flag", "unflag"]),
  reason: z.string().min(1).max(500),
})

export type ClaimRequest = z.infer<typeof claimRequestSchema>
export type WithdrawalRequest = z.infer<typeof withdrawalRequestSchema>
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>
export type ContactForm = z.infer<typeof contactFormSchema>
export type AdminUserAction = z.infer<typeof adminUserActionSchema>
export type AdminBulkAction = z.infer<typeof adminBulkActionSchema>
