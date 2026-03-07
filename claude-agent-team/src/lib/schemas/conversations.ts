import { z } from "zod";

export const createConversationSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().optional(),
});
