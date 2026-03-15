import { useHSServiceWithAuth } from '../../../src/index.ts';

export function service() {
  return useHSServiceWithAuth();
}
