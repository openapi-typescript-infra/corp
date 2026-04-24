import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import type { AgentInternal, ModelSpec } from '#src/types/index.js';

export class AiModels {
  private readonly app: AgentInternal['App'];

  constructor(app: AgentInternal['App']) {
    this.app = app;
  }

  resolve(modelName: string): LanguageModel {
    const spec = this.app.locals.config.models?.[modelName];
    if (!spec) {
      throw new Error(`Unknown model: ${modelName}`);
    }
    return this.createModel(spec);
  }

  private createModel(spec: ModelSpec): LanguageModel {
    const model = spec.model;

    if (model.startsWith('claude-') || model.startsWith('anthropic/')) {
      const anthropic = createAnthropic();
      return anthropic(model.replace('anthropic/', ''));
    }

    if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('openai/')) {
      const openai = createOpenAI();
      return openai(model.replace('openai/', ''));
    }

    // Default to OpenAI-compatible provider
    const openai = createOpenAI();
    return openai(model);
  }
}
