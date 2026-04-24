import { z } from 'zod/v3';

import { tool } from '#src/tool.js';

export const yes_no_question = tool({
  name: 'yes_no_question',
  tags: ['client', 'question'],
  description: 'Ask a yes/no question',
  inputSchema: z.object({
    question: z.string().describe('The question to ask'),
    yes_utterance: z
      .string()
      .optional()
      .describe('Text spoken by the user if they answer yes (first-person, user voice)'),
    no_utterance: z
      .string()
      .optional()
      .describe('Text spoken by the user if they answer no (first-person, user voice)'),
  }),
  outputSchema: z.object({
    answer: z.boolean().describe('Whether the user answered yes (true) or no (false)'),
  }),
  processClientResult: (_session, clientResult) => {
    if (clientResult === undefined) {
      return 'The user did not respond to this question.';
    }
    return clientResult;
  },
});

export const multiple_choice_question = tool({
  name: 'multiple_choice_question',
  tags: ['client', 'question'],
  description: 'Ask a multiple choice question',
  inputSchema: z.object({
    question: z.string().describe('The question to ask'),
    choices: z.array(z.string()).describe('The available choices'),
    allow_multiple: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, the user may select multiple choices; otherwise exactly one.'),
  }),
  outputSchema: z.object({
    selected: z.array(z.string()).describe('The choice(s) selected by the user'),
  }),
  processClientResult: (_session, clientResult) => {
    if (clientResult === undefined) {
      return 'The user did not respond to this question.';
    }
    return clientResult;
  },
});
