import { z } from 'zod/v3';

import { returnToClient } from '#src/constants.js';

export const EmptyResultSchema = z.object({});

export type EmptyResult = z.infer<typeof EmptyResultSchema>;

export const EMPTY_RESULT: EmptyResult = {};

export function emptyClientResult(): EmptyResult {
  return returnToClient(EMPTY_RESULT);
}
