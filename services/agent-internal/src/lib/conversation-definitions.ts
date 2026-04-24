import type { ConversationDefinition } from './conversation-definition.js';
import { CustomerSupportConversationDefinition } from './customer-support-conversation-definition.js';

const definitions: ConversationDefinition[] = [new CustomerSupportConversationDefinition()];

export function registerConversationDefinition(definition: ConversationDefinition) {
  definitions.push(definition);
}

export function findConversationDefinition(type: string) {
  return definitions.find((definition) => definition.type === type);
}
