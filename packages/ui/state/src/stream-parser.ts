export interface StreamToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
}

export interface ParsedAgentMessage {
  text: string;
  toolCalls: StreamToolCall[];
  complete: boolean;
  error?: string;
}

export interface AgentStreamParserOptions {
  onUpdate?(message: ParsedAgentMessage): void;
  onComplete?(message: ParsedAgentMessage): void;
  onError?(error: Error): void;
}

interface PendingToolCall {
  id: string;
  name?: string;
  inputText: string;
}

/** Parses the Server-Sent Events emitted by agent-internal's AI SDK stream. */
export class AgentStreamParser {
  private readonly decoder = new TextDecoder();
  private readonly pending = new Map<string, PendingToolCall>();
  private buffer = '';
  private finished = false;
  private readonly message: ParsedAgentMessage = { text: '', toolCalls: [], complete: false };

  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly options: AgentStreamParserOptions = {},
  ) {}

  static fromResponse(response: Response, options?: AgentStreamParserOptions) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Agent response did not include a stream');
    return new AgentStreamParser(reader, options);
  }

  async readAll(): Promise<ParsedAgentMessage> {
    while (!this.finished) {
      const { done, value } = await this.reader.read();
      if (done) {
        this.finish();
        break;
      }
      this.buffer += this.decoder.decode(value, { stream: true });
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop() ?? '';
      for (const line of lines) this.parseLine(line);
    }
    return this.snapshot();
  }

  private parseLine(line: string) {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') {
      this.finish();
      return;
    }
    try {
      this.handle(JSON.parse(payload) as Record<string, unknown>);
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error(`Invalid agent stream event: ${payload}`),
      );
    }
  }

  private handle(event: Record<string, unknown>) {
    const type = String(event.type ?? '');
    if (type === 'text-delta' && typeof event.delta === 'string') {
      this.message.text += event.delta;
      this.update();
      return;
    }
    if (type === 'tool-input-start') {
      const id = String(event.toolCallId ?? '');
      if (id) this.pending.set(id, { id, name: asString(event.toolName), inputText: '' });
      return;
    }
    if (type === 'tool-input-delta' || type === 'tool-call-delta') {
      const id = String(event.toolCallId ?? '');
      if (!id) return;
      const pending = this.pending.get(id) ?? { id, inputText: '' };
      pending.name = asString(event.toolName) ?? pending.name;
      pending.inputText += asString(event.inputTextDelta ?? event.argsTextDelta) ?? '';
      this.pending.set(id, pending);
      return;
    }
    if (type === 'tool-input-available' || type === 'tool-call') {
      const id = String(event.toolCallId ?? '');
      const name = asString(event.toolName);
      if (!id || !name) return;
      const pending = this.pending.get(id);
      const wireInput = event.input ?? event.args;
      const input = isRecord(wireInput) ? wireInput : (parseRecord(pending?.inputText) ?? {});
      this.upsert({ id, name, input });
      this.pending.delete(id);
      this.update();
      return;
    }
    if (type === 'tool-output-available' || type === 'tool-result') {
      const id = String(event.toolCallId ?? '');
      const call = this.message.toolCalls.find((candidate) => candidate.id === id);
      if (call) call.output = event.output;
      this.update();
      return;
    }
    if (type === 'error') {
      this.message.error = String(event.error ?? 'Agent stream failed');
      this.options.onError?.(new Error(this.message.error));
      this.finish();
      return;
    }
    if (type === 'finish' || type === 'done' || type === 'end') {
      if (Array.isArray(event.toolCalls)) {
        for (const value of event.toolCalls) {
          if (!isRecord(value)) continue;
          const id = asString(value.id);
          const name = asString(value.name);
          if (id && name)
            this.upsert({ id, name, input: isRecord(value.input) ? value.input : {} });
        }
      }
      this.finish();
    }
  }

  private upsert(call: StreamToolCall) {
    const index = this.message.toolCalls.findIndex((candidate) => candidate.id === call.id);
    if (index < 0) this.message.toolCalls.push(call);
    else this.message.toolCalls[index] = { ...this.message.toolCalls[index], ...call };
  }

  private update() {
    this.options.onUpdate?.(this.snapshot());
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.message.complete = true;
    const snapshot = this.snapshot();
    this.options.onUpdate?.(snapshot);
    this.options.onComplete?.(snapshot);
    void this.reader.cancel().catch(() => {});
  }

  private snapshot(): ParsedAgentMessage {
    return { ...this.message, toolCalls: this.message.toolCalls.map((call) => ({ ...call })) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseRecord(value?: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
