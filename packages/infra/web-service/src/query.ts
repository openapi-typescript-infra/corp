import type { Request } from 'express';

type NodeQueryValues = Request['query'][string];

export function toURLSearchParams(query: Record<string, NodeQueryValues>): URLSearchParams {
  const mapped: string[][] = Object.entries(query)
    .filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0))
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value]) as string[][];
  return new URLSearchParams(mapped);
}
