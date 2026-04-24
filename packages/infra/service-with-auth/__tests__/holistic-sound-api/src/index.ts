import { useJTMServiceWithAuth } from '../../../src/index.ts';

export function service() {
  return useJTMServiceWithAuth();
}
