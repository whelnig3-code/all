import { z } from "zod";

export const updateSettingsSchema = z.object({
  projectBasePath: z.string().optional(),
  defaultModel: z.string().optional(),
  agentModels: z.record(z.string(), z.string()).optional(),
});
