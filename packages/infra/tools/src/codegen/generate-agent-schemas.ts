/**
 * Generates the "agent wire format" discriminated-union schemas from the
 * source-of-truth `ToolCall<X>.yaml` / `ToolResult<X>.yaml` files. Emits:
 *
 *   api/generated/AgentToolCall<X>.yaml      { id, name, input, response? }
 *   api/generated/AgentToolResponse<X>.yaml  { id, name, complex_result?, text_result? }
 *   api/generated/AgentToolCall.yaml         discriminator oneOf over all AgentToolCall<X>
 *   api/generated/AgentToolResponse.yaml     discriminator oneOf over all AgentToolResponse<X>
 *
 * Runs after `generate-input-output-schemas.ts`.
 */

import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'yaml';

interface DiscriminatedSchema {
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
}

interface VariantDoc {
  properties?: {
    input?: unknown;
    output?: unknown;
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const generatedDir = join(root, 'api', 'generated');

mkdirSync(generatedDir, { recursive: true });
// Clear only this generator's outputs so it can coexist with the Zod->OpenAPI
// generator that produces Input/Output and ToolCall/ToolResult schemas in
// the same directory.
for (const f of readdirSync(generatedDir)) {
  if (/^AgentTool(Call|Response).*\.yaml$/.test(f)) {
    unlinkSync(join(generatedDir, f));
  }
}

const readGeneratedYaml = <T = unknown>(filename: string): T =>
  yaml.parse(readFileSync(join(generatedDir, filename), 'utf-8')) as T;

const toolCall = readGeneratedYaml<DiscriminatedSchema>('ToolCall.yaml');
const toolResult = readGeneratedYaml<DiscriminatedSchema>('ToolResult.yaml');
const callMapping = toolCall.discriminator?.mapping ?? {};
const resultMapping = toolResult.discriminator?.mapping ?? {};
const toolNames = Object.keys(callMapping).sort();

if (toolNames.length === 0) {
  throw new Error(
    'No tools found in api/generated/ToolCall.yaml discriminator mapping — ' +
      'did you forget to run generate-input-output-schemas first?',
  );
}

function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(rewriteRefs);
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = rewriteRefs(v);
    }
    return out;
  }
  return node;
}

const pascalFromRef = (ref: string, prefix: string): string => {
  const base =
    ref
      .split('/')
      .pop()
      ?.replace(/\.yaml$/, '') ?? '';
  return base.startsWith(prefix) ? base.slice(prefix.length) : base;
};

const callVariantFiles: string[] = [];
const responseVariantFiles: string[] = [];
const agentCallMapping: Record<string, string> = {};
const agentResponseMapping: Record<string, string> = {};

for (const name of toolNames) {
  const callRef = callMapping[name];
  const resultRef = resultMapping[name];
  const pascal = pascalFromRef(callRef, 'ToolCall');

  const callVariantDoc = yaml.parse(
    readFileSync(join(generatedDir, callRef.replace(/^\.\//, '')), 'utf-8'),
  ) as VariantDoc;
  const inputProp = callVariantDoc.properties?.input;

  let outputProp: unknown;
  if (resultRef) {
    const resultVariantDoc = yaml.parse(
      readFileSync(join(generatedDir, resultRef.replace(/^\.\//, '')), 'utf-8'),
    ) as VariantDoc;
    outputProp = resultVariantDoc.properties?.output;
  }

  const agentCall = {
    type: 'object',
    required: ['id', 'name', 'input'],
    properties: {
      id: { type: 'string', description: 'The unique identifier for the tool call' },
      name: { type: 'string', enum: [name] },
      input: inputProp ? rewriteRefs(inputProp) : { type: 'object', additionalProperties: true },
      sequence: {
        type: 'integer',
        description:
          'Position in the overall turn content order, shared with messages. Clients can merge messages and tool_calls then sort by sequence to reconstruct the original interleaving.',
      },
      ...(outputProp ? { output: rewriteRefs(outputProp) } : {}),
    },
  };
  const callFile = `AgentToolCall${pascal}.yaml`;
  writeFileSync(join(generatedDir, callFile), yaml.stringify(agentCall));
  callVariantFiles.push(callFile);
  agentCallMapping[name] = `./${callFile}`;

  const agentResponse = {
    type: 'object',
    required: ['id', 'name'],
    properties: {
      id: { type: 'string', description: 'The unique identifier for the tool call' },
      name: { type: 'string', enum: [name] },
      ...(outputProp ? { complex_result: rewriteRefs(outputProp) } : {}),
      text_result: { type: 'string' },
    },
  };
  const responseFile = `AgentToolResponse${pascal}.yaml`;
  writeFileSync(join(generatedDir, responseFile), yaml.stringify(agentResponse));
  responseVariantFiles.push(responseFile);
  agentResponseMapping[name] = `./${responseFile}`;
}

writeFileSync(
  join(generatedDir, 'AgentToolCall.yaml'),
  yaml.stringify({
    description: 'An agent tool call on the wire, discriminated on the tool name.',
    discriminator: { propertyName: 'name', mapping: agentCallMapping },
    oneOf: callVariantFiles.map((f) => ({ $ref: `./${f}` })),
  }),
);

writeFileSync(
  join(generatedDir, 'AgentToolResponse.yaml'),
  yaml.stringify({
    description: 'An agent tool response on the wire, discriminated on the tool name.',
    discriminator: { propertyName: 'name', mapping: agentResponseMapping },
    oneOf: responseVariantFiles.map((f) => ({ $ref: `./${f}` })),
  }),
);

console.log(
  `Generated ${toolNames.length} per-tool variants + AgentToolCall.yaml + AgentToolResponse.yaml in ${generatedDir}`,
);
