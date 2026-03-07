import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  description: z.string().optional(),
  path: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  path: z.string().optional(),
});
