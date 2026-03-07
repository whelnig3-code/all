import { z } from "zod";

export const updateFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const readDirSchema = z.object({
  dir: z.string().optional().default(""),
  depth: z.number().int().min(1).max(10).optional().default(2),
});
