import type { ServiceExpress, ServiceLocals } from '@openapi-typescript-infra/service';
import type { NextPageContext } from 'next';

export function getApp<T extends ServiceLocals>(context: NextPageContext): ServiceExpress<T> {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(context.req), 'app');
  if (!descriptor?.value) {
    throw new Error('App not found on request');
  }
  return descriptor.value as ServiceExpress<T>;
}
