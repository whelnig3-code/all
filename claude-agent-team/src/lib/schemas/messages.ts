import { z } from "zod";

export const addMessageSchema = z.object({
  conversationId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const updateMessageSchema = z.object({
  conversationId: z.string().min(1),
  messageIndex: z.number().int().min(0),
  content: z.string().min(1),
});

export const deleteMessageSchema = z.object({
  conversationId: z.string().min(1),
  messageIndex: z.number().int().min(0),
});
