import { ExternalIDType, getUuidFromString, stringToExternalID } from '@justtellme/external-id';

export function getConversationId(conversationUuid: string): string {
  return stringToExternalID(ExternalIDType.AgentConversation, conversationUuid);
}

export function getConversationUuid(conversationId: string): string {
  return getUuidFromString(conversationId, ExternalIDType.AgentConversation) ?? conversationId;
}

export function getTurnId(turnUuid: string): string {
  return stringToExternalID(ExternalIDType.AgentConversationTurn, turnUuid);
}

export function getTurnUuid(turnId: string): string {
  return getUuidFromString(turnId, ExternalIDType.AgentConversationTurn) ?? turnId;
}
