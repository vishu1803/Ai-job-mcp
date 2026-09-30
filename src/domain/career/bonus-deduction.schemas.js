/**
 * @file Bonus & Deduction Schemas (Phase 13)
 *
 * Schemas for deterministic bonus and deduction modifiers with strict capping
 * (Bonuses capped at <= +10.0%, Deductions capped at <= -20.0%).
 */

import { z } from 'zod';

export const ModifierTypeSchema = z.enum(['BONUS', 'DEDUCTION']);

export const ModifierItemSchema = z
  .object({
    ruleId: z.string(),
    name: z.string(),
    type: ModifierTypeSchema,
    amount: z.number(), // Positive for BONUS, negative for DEDUCTION
    evidence: z.array(z.string()),
    reason: z.string(),
  })
  .strict();

export const BonusDeductionReportSchema = z
  .object({
    netModifierPercentage: z.number().min(-20.0).max(10.0),
    totalBonus: z.number().min(0.0).max(10.0),
    totalDeduction: z.number().min(0.0).max(20.0),
    bonuses: z.array(ModifierItemSchema),
    deductions: z.array(ModifierItemSchema),
    summary: z.string(),
    evaluatedAt: z.string().datetime(),
  })
  .strict();
