import { describe, expect, test } from 'vitest';

import { multiple_choice_question, yes_no_question } from './client/question.js';
import { getRegistry } from './tool.js';

describe('Tool registry', () => {
  test('should register question tools', () => {
    expect(yes_no_question).toBeDefined();
    expect(multiple_choice_question).toBeDefined();
  });

  test('registry should contain registered tools', () => {
    const registry = getRegistry();
    expect(registry.has('yes_no_question')).toBe(true);
    expect(registry.has('multiple_choice_question')).toBe(true);
    expect(registry.size).toBe(2);
  });
});
