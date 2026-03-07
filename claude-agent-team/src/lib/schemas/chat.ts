import { z } from "zod";

const fileAttachmentSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["image", "file"]),
  content: z.string().min(1),
  mimeType: z.string().optional(),
});

export const chatRequestSchema = z.object({
  message: z.string().optional().default(""),
  targetAgent: z.string().min(1).max(60).optional(),
  conversationId: z.string().optional(),
  projectDefaultAgent: z.string().min(1).max(60).optional(),
  attachments: z.array(fileAttachmentSchema).optional(),
});
