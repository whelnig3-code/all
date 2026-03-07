import { z } from "zod";

export const createTodoSchema = z.object({
  text: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

export const updateTodoSchema = z.object({
  id: z.string().min(1),
  done: z.boolean().optional(),
  text: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});
