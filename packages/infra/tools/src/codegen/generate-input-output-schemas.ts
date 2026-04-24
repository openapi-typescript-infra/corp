/**
 * Generates per-tool `<X>Input.yaml` and `<X>Output.yaml` files from the
 * Zod schemas declared on each tool definition. This makes Zod the single
 * source of truth for the tool wire format.
 *
 * Output: api/generated/ (gitignored). Runs before generate-agent-schemas.ts
 * as part of the `generate` script so the agent-schemas generator sees fresh inputs.
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import yaml from 'yaml';
import { z } from 'zod/v3';

// Must happen before any Zod schemas are imported.
// The cast bridges zod/v3 compat layer types with what zod-to-openapi expects.
// biome-ignore lint/suspicious/noExplicitAny: zod v3/v4 compat bridge
extendZodWithOpenApi(z as any);

// Importing the barrel triggers every tool's `tool()` call, which registers
// the tool (with its schemas) in the shared registry.
import '#src/getTools.js';
import { getRegistry } from '#src/tool.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'api', 'generated');

mkdirSync(outDir, { recursive: true });

// Clear only Input/Output files — leave AgentToolCall*/AgentToolResponse* alone
// so this generator can coexist with generate-agent-schemas.ts running in
// either order.
for (const f of readdirSync(outDir)) {
  if (/^[A-Z].*(Input|Output)\.yaml$/.test(f)) {
    unlinkSync(join(outDir, f));
  }
}

const toPascal = (snake: string): string =>
  snake
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const registry = new OpenAPIRegistry();
const schemaNames: string[] = [];
interface ToolEntry {
  name: string;
  pascal: string;
  hasOutput: boolean;
}
const toolEntries: ToolEntry[] = [];

for (const [toolName, def] of getRegistry()) {
  const pascal = toPascal(toolName);
  const inputName = `${pascal}Input`;
  const outputName = `${pascal}Output`;

  // FlexibleSchema accepts any standard-schema implementation; in practice
  // every tool in this repo uses Zod, so the cast is safe.
  // biome-ignore lint/suspicious/noExplicitAny: zod v3/v4 compat bridge
  registry.register(inputName, def.inputSchema as any);
  schemaNames.push(inputName);

  if (def.outputSchema) {
    // biome-ignore lint/suspicious/noExplicitAny: zod v3/v4 compat bridge
    registry.register(outputName, def.outputSchema as any);
    schemaNames.push(outputName);
  }

  toolEntries.push({ name: toolName, pascal, hasOutput: !!def.outputSchema });
}

const generator = new OpenApiGeneratorV3(registry.definitions);
const document = generator.generateComponents();
const schemas = document.components?.schemas ?? {};

/**
 * zod-to-openapi emits `z.unknown()` as `{nullable: true}` with no `type`.
 * AJV (and strict OpenAPI validators) reject `nullable` without a `type`
 * companion. Convert to `{type: 'object', additionalProperties: true}`.
 */
function normalizeUnknownNodes(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(normalizeUnknownNodes);
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && obj.nullable === true) {
      return { type: 'object', additionalProperties: true };
    }
    if (keys.every((k) => k === 'nullable' || k === 'description') && obj.nullable === true) {
      return {
        type: 'object',
        additionalProperties: true,
        ...(typeof obj.description === 'string' ? { description: obj.description } : {}),
      };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = normalizeUnknownNodes(v);
    }
    return out;
  }
  return node;
}

let written = 0;
for (const name of schemaNames) {
  const schema = schemas[name];
  if (!schema) {
    console.warn(`  skipping ${name} — not produced by the OpenAPI generator`);
    continue;
  }
  writeFileSync(join(outDir, `${name}.yaml`), yaml.stringify(normalizeUnknownNodes(schema)));
  written++;
}

// ── ToolCall / ToolResult discriminators ────────────────────────────────────

const toolCallMapping: Record<string, string> = {};
const toolResultMapping: Record<string, string> = {};
const toolCallOneOf: { $ref: string }[] = [];
const toolResultOneOf: { $ref: string }[] = [];

const sortedEntries = [...toolEntries].sort((a, b) => a.name.localeCompare(b.name));
for (const { name, pascal, hasOutput } of sortedEntries) {
  const callVariantFile = `ToolCall${pascal}.yaml`;
  writeFileSync(
    join(outDir, callVariantFile),
    yaml.stringify({
      type: 'object',
      required: ['name', 'input'],
      properties: {
        name: { type: 'string', enum: [name] },
        input: { $ref: `./${pascal}Input.yaml` },
      },
    }),
  );
  toolCallMapping[name] = `./${callVariantFile}`;
  toolCallOneOf.push({ $ref: `./${callVariantFile}` });

  if (hasOutput) {
    const resultVariantFile = `ToolResult${pascal}.yaml`;
    writeFileSync(
      join(outDir, resultVariantFile),
      yaml.stringify({
        type: 'object',
        required: ['name', 'output'],
        properties: {
          name: { type: 'string', enum: [name] },
          output: { $ref: `./${pascal}Output.yaml` },
        },
      }),
    );
    toolResultMapping[name] = `./${resultVariantFile}`;
    toolResultOneOf.push({ $ref: `./${resultVariantFile}` });
  }
}

writeFileSync(
  join(outDir, 'ToolCall.yaml'),
  yaml.stringify({
    description: 'A tool call binding a tool name to its input parameters.',
    discriminator: { propertyName: 'name', mapping: toolCallMapping },
    oneOf: toolCallOneOf,
  }),
);

writeFileSync(
  join(outDir, 'ToolResult.yaml'),
  yaml.stringify({
    description: 'A tool result binding a tool name to its output.',
    discriminator: { propertyName: 'name', mapping: toolResultMapping },
    oneOf: toolResultOneOf,
  }),
);

// ── components.yaml ────────────────────────────────────────────────────────

const componentsMap: Record<string, { $ref: string }> = {};

for (const name of schemaNames) {
  if (!schemas[name]) {
    continue;
  }
  componentsMap[name] = { $ref: `./${name}.yaml` };
}

componentsMap.ToolCall = { $ref: './ToolCall.yaml' };
componentsMap.ToolResult = { $ref: './ToolResult.yaml' };
componentsMap.AgentToolCall = { $ref: './AgentToolCall.yaml' };
componentsMap.AgentToolResponse = { $ref: './AgentToolResponse.yaml' };

writeFileSync(join(outDir, 'components.yaml'), yaml.stringify(componentsMap));

console.log(`Generated ${written} Input/Output YAMLs in ${outDir}`);
