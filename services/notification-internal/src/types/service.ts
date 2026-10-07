import type { JTMRequestLocals, JTMServiceLocals } from '@justtellme/service';
import type { ServiceTypes } from '@openapi-typescript-infra/service';

import type { operationHandlers } from '../generated/service/index.ts';
import type { NotificationDispatcher } from '../lib/notifications.ts';

import type { NotificationInternalConfigSchema } from './config.ts';

export interface NotificationInternalLocals
  extends JTMServiceLocals<NotificationInternalConfigSchema> {
  notifications: NotificationDispatcher;
}

export type NotificationInternalRequestLocals = JTMRequestLocals;

export type NotificationInternal = ServiceTypes<
  NotificationInternalLocals,
  NotificationInternalRequestLocals
>;

export type NotificationInternalApi = operationHandlers<
  NotificationInternalLocals,
  NotificationInternalRequestLocals
>;
