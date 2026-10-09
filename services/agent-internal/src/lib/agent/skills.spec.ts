import type { SkillSpec } from '@sesamecare-oss/ai-templating';
import { describe, expect, test } from 'vitest';
import { resolveSkillSpecs } from './skills.js';

describe('skill tool resolution', () => {
  const skill: SkillSpec = {
    name: 'support',
    description: 'Help the customer',
    detail: 'Follow the support workflow.',
    composable: true,
  };

  test('preserves skill metadata and unconditional tools', () => {
    const spec = { ...skill, tools: ['lookup', { name: 'reply' }] };
    expect(resolveSkillSpecs([spec], { flow: 'customer-support' })).toEqual([
      { ...skill, tools: ['lookup', 'reply'] },
    ]);
    expect(spec.tools).toEqual(['lookup', { name: 'reply' }]);
  });

  test('evaluates tool rules for each flow, with exclusions taking precedence', () => {
    const spec = {
      ...skill,
      tools: [
        'lookup',
        'refund',
        { name: 'refund', exclude: 'flow != "customer-support"' },
        { name: 'escalate', include: 'flow == "customer-support"' },
      ],
    };
    expect(resolveSkillSpecs([spec], { flow: 'customer-support' })[0].tools).toEqual([
      'lookup',
      'refund',
      'escalate',
    ]);
    expect(resolveSkillSpecs([spec], { flow: 'onboarding' })[0].tools).toEqual(['lookup']);
  });

  test('supports skills without tool bindings', () => {
    expect(resolveSkillSpecs([skill], { flow: 'customer-support' })).toEqual([
      { ...skill, tools: [] },
    ]);
  });
});
