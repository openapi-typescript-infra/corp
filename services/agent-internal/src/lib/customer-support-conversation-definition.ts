import type { components } from '#src/generated/service/index.js';
import type { AgentInternal } from '#src/types/index.js';
import {
  assertEnabledToolsAreAvailable,
  createToolRegistryFromSession,
  noopAsyncTaskProvider,
  type ToolSession,
} from './agent/tools.js';
import { ConversationDefinition, type RenderedInitialTurn } from './conversation-definition.js';
import { createAgentToolUseSession } from './tool-session.js';
import { normalizeToolNames } from './tools/state.js';

type CreateConversationRequest = components['schemas']['CreateConversationRequest'];

export class CustomerSupportConversationDefinition extends ConversationDefinition {
  readonly type = 'customer-support';
  readonly toolSession: ToolSession = { role: 'user' };
  private readonly prompt = 'customer-support/main';

  getInitialToolNames(_request: CreateConversationRequest): string[] {
    return ['yes_no_question', 'multiple_choice_question'];
  }

  async renderInitialTurn(
    app: AgentInternal['App'],
    conversationId: string,
    request: CreateConversationRequest,
  ): Promise<RenderedInitialTurn> {
    const toolNames = normalizeToolNames(this.getInitialToolNames(request));

    const toolUseSession = createAgentToolUseSession(app, noopAsyncTaskProvider, undefined, {
      role: this.toolSession.role,
    });
    const registry = createToolRegistryFromSession(toolUseSession);
    assertEnabledToolsAreAvailable(registry, toolNames);

    const rendered = await app.locals.templates.render(this.prompt, {}, undefined, {
      conversationUuid: conversationId,
    });

    return {
      startingTools: toolNames,
      messages: rendered.messages,
    };
  }
}
