import { z } from "zod";

export const createWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  steps: z.array(z.string()).optional().default([]),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  steps: z.array(z.string()).optional(),
});
