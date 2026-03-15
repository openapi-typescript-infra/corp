import { toFunction } from '@sesamecare-oss/async-rule-evaluator';

import { RequestFunctions } from './functions.ts';

type Fn = ReturnType<typeof toFunction>;

export function getVerificationCache(functions?: Record<string, () => unknown>) {
  const cache = new Map<string, Fn>();
  const options = {
    functions: {
      ...RequestFunctions,
      ...functions,
    },
  };

  return {
    compile(rule: string): Fn {
      return toFunction(rule, options);
    },
    getFunction(rule: string): Fn {
      if (!cache.has(rule)) {
        const fn = toFunction(rule, options);
        cache.set(rule, fn);
        return fn;
      }
      return cache.get(rule) as Fn;
    },
  };
}
