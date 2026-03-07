import { z } from "zod";

const VALID_AGENTS = [
  "planner", "developer", "reviewer", "writer",
  "security-auditor", "researcher", "designer",
] as const;

export const createRoutingRuleSchema = z.object({
  priority: z.number().int().min(100).max(999),
  agent: z.enum(VALID_AGENTS),
  keywords: z.array(z.string().min(1)).min(1),
  description: z.string().min(1).max(200),
});

export const updateRoutingRuleSchema = z.object({
  id: z.string().min(1),
  priority: z.number().int().min(100).max(999).optional(),
  agent: z.enum(VALID_AGENTS).optional(),
  keywords: z.array(z.string().min(1)).min(1).optional(),
  description: z.string().min(1).max(200).optional(),
});

export const deleteRoutingRuleSchema = z.object({
  id: z.string().min(1),
});
