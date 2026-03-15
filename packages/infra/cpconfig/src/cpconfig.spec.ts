import { describe, expect, test } from 'vitest';

import { config } from './index.ts';

describe('Module exports', () => {
  test('should export expected elements', () => {
    expect(config).toBeInstanceOf(Function);
    const configValue = config({});
    expect(configValue['.commitlintrc.yaml']).toBeDefined();
    expect(configValue['eslint.config.mts']).toBeDefined();
    expect(configValue['tsconfig.json']).toBeDefined();
    expect(configValue['tsconfig.build.json']).toBeDefined();
    expect(configValue['.prettierrc.yaml']).toBeDefined();
    expect(configValue['vitest.config.ts']).toBeDefined();
    expect(configValue['tsconfig.tsup.json']).toBeDefined();
  });
});
