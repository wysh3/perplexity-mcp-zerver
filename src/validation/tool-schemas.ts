/**
 * Zod validation schemas for MCP tool arguments
 * All tool inputs must be validated against these schemas
 */

import { z } from "zod";
import { urlSecurity } from "../utils/url-security.js";

export const SEARCH_SCHEMA = z.object({
  query: z.string().min(1, "Query cannot be empty").max(5000, "Query too long"),
  detail_level: z.enum(["brief", "normal", "detailed"]).optional(),
  stream: z.boolean().optional(),
});

export const EXTRACT_URL_SCHEMA = z.object({
  url: z
    .string()
    .min(1, "URL cannot be empty")
    .max(2000, "URL too long")
    .refine((url) => {
      try {
        new URL(url);
      } catch {
        return false;
      }
      return true;
    }, "Invalid URL format")
    .refine((url) => {
      const validation = urlSecurity.validateURL(url);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }
      return true;
    }, "URL blocked by security policy"),
  depth: z.number().int().min(1).max(5).optional(),
});

export const GET_CHAT_HISTORY_SCHEMA = z.object({
  chat_id: z.string().min(1, "chat_id cannot be empty").max(100),
});

export const CREATE_CHAT_SCHEMA = z.object({
  message: z.string().min(1, "Message cannot be empty").max(10000, "Message too long"),
  chat_id: z.string().min(1, "chat_id cannot be empty").max(100).optional(),
  detail_level: z.enum(["brief", "normal", "detailed"]).optional(),
  stream: z.boolean().optional(),
});

export const CONTINUE_CHAT_SCHEMA = z.object({
  message: z.string().min(1, "Message cannot be empty").max(10000, "Message too long"),
  chat_id: z.string().min(1, "chat_id cannot be empty").max(100),
  detail_level: z.enum(["brief", "normal", "detailed"]).optional(),
  stream: z.boolean().optional(),
});

export const DELETE_CHAT_SCHEMA = z.object({
  chat_id: z.string().min(1, "chat_id cannot be empty").max(100),
});

export const LIST_CHATS_SCHEMA = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export type SearchArgs = z.infer<typeof SEARCH_SCHEMA>;
export type ExtractUrlArgs = z.infer<typeof EXTRACT_URL_SCHEMA>;
export type GetChatHistoryArgs = z.infer<typeof GET_CHAT_HISTORY_SCHEMA>;
export type CreateChatArgs = z.infer<typeof CREATE_CHAT_SCHEMA>;
export type ContinueChatArgs = z.infer<typeof CONTINUE_CHAT_SCHEMA>;
export type DeleteChatArgs = z.infer<typeof DELETE_CHAT_SCHEMA>;
export type ListChatsArgs = z.infer<typeof LIST_CHATS_SCHEMA>;
