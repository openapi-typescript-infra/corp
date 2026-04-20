import { describe, expect, test } from 'vitest';

import { config } from './index.ts';

describe('Module exports', () => {
  test('should export expected elements', () => {
    expect(config).toBeInstanceOf(Function);
    const configValue = config({});
    expect(configValue['.commitlintrc.yaml']).toBeDefined();
    expect(configValue['biome.jsonc']).toBeDefined();
    expect(configValue['tsconfig.json']).toBeDefined();
    expect(configValue['tsconfig.build.json']).toBeDefined();
    expect(configValue['vitest.config.ts']).toBeDefined();
    expect(configValue['tsconfig.tsup.json']).toBeDefined();
  });

  test('should include node types when @types/node is configured', () => {
    const configValue = config({
      devDependencies: {
        '@types/node': '^25.5.2',
      },
    });
    const tsconfig = JSON.parse(configValue['tsconfig.json'].contents);

    expect(tsconfig.compilerOptions.types).toEqual(['node']);
    expect(JSON.parse(config({})['tsconfig.json'].contents).compilerOptions.types).toBeUndefined();
  });
});
