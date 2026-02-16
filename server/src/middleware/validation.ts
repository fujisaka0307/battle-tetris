import { z } from 'zod';
import { logger } from '../lib/logger.js';

// =============================================================================
// Client → Server payload schemas
// =============================================================================

export const CreateAiRoomSchema = z.object({
  aiLevel: z.number().int().min(1).max(10),
});

export const JoinRoomSchema = z.object({
  roomId: z.string().length(6),
});

export const FieldUpdateSchema = z.object({
  field: z.array(z.array(z.number())),
  score: z.number().int().min(0),
  lines: z.number().int().min(0),
  level: z.number().int().min(0),
});

export const LinesClearedSchema = z.object({
  count: z.number().int().min(0).max(4),
});

/**
 * ペイロードをバリデーションする。
 * 成功時はパースされた値を返し、失敗時は null を返す。
 */
export function validatePayload<T>(
  schema: z.ZodType<T>,
  data: unknown,
): T | null {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  logger.warn({ issues: result.error.issues }, 'Payload validation failed');
  return null;
}
