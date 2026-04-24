export function normalizeToolNames(toolNames: readonly string[] | undefined | null) {
  if (!toolNames || toolNames.length === 0) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const toolName of toolNames) {
    if (!toolName || seen.has(toolName)) {
      continue;
    }

    seen.add(toolName);
    normalized.push(toolName);
  }

  return normalized;
}

export function applyToolDelta(
  startingTools: readonly string[],
  delta: {
    addedTools?: readonly string[] | null;
    removedTools?: readonly string[] | null;
  },
) {
  const removedTools = new Set(normalizeToolNames(delta.removedTools));
  const tools = normalizeToolNames(startingTools).filter((toolName) => !removedTools.has(toolName));

  for (const toolName of normalizeToolNames(delta.addedTools)) {
    if (!tools.includes(toolName)) {
      tools.push(toolName);
    }
  }

  return tools;
}

export function diffToolNames(startingTools: readonly string[], endingTools: readonly string[]) {
  const start = normalizeToolNames(startingTools);
  const end = normalizeToolNames(endingTools);
  const startSet = new Set(start);
  const endSet = new Set(end);

  return {
    addedTools: end.filter((toolName) => !startSet.has(toolName)),
    removedTools: start.filter((toolName) => !endSet.has(toolName)),
  };
}
