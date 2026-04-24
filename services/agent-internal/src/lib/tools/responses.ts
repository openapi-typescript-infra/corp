import type { components } from '#src/generated/service/index.js';

type ToolCall = components['schemas']['AgentToolCall'];
type ToolResponse = components['schemas']['AgentToolResponse'];
type MultipleChoiceQuestionInput = components['schemas']['MultipleChoiceQuestionInput'];

export interface MultipleChoiceOption {
  value: string;
  label: string;
}

export function getMultipleChoiceOptions(request: ToolCall): MultipleChoiceOption[] {
  const input = request.input as MultipleChoiceQuestionInput;
  if (!Array.isArray(input.choices)) {
    return [];
  }

  return (input.choices as unknown[])
    .map((choice): MultipleChoiceOption | null => {
      if (typeof choice === 'string') {
        return { value: choice, label: choice };
      }

      if (
        typeof choice === 'object' &&
        choice !== null &&
        !Array.isArray(choice) &&
        typeof (choice as Record<string, unknown>).label === 'string'
      ) {
        const obj = choice as Record<string, unknown>;
        return {
          value: typeof obj.id === 'string' ? obj.id : (obj.label as string),
          label: obj.label as string,
        };
      }

      return null;
    })
    .filter((choice): choice is MultipleChoiceOption => choice !== null);
}

export function parseYesNoToolResponse(text: string) {
  const normalized = text.trim().toLowerCase();
  if (['y', 'yes', 'true', '1'].includes(normalized)) {
    return true;
  }
  if (['n', 'no', 'false', '0'].includes(normalized)) {
    return false;
  }
  throw new Error('Yes/no tool responses must be one of: yes, no, true, false, 1, 0');
}

function resolveMultipleChoiceSelection(
  request: ToolCall,
  selection: string,
  options: MultipleChoiceOption[],
) {
  const numeric = Number.parseInt(selection, 10);
  if (!Number.isNaN(numeric) && String(numeric) === selection) {
    const option = options[numeric - 1];
    if (option) {
      return option.value;
    }
  }

  const lowered = selection.toLowerCase();
  const option = options.find(
    (candidate) =>
      candidate.value.toLowerCase() === lowered || candidate.label.toLowerCase() === lowered,
  );
  if (option) {
    return option.value;
  }

  throw new Error(
    `Unknown choice "${selection}" for ${request.id}. Expected one of: ${options
      .map((option, index) => `${index + 1}:${option.label}`)
      .join(', ')}`,
  );
}

export function parseMultipleChoiceToolResponse(request: ToolCall, text: string) {
  const options = getMultipleChoiceOptions(request);
  if (options.length === 0) {
    throw new Error('Multiple choice tool request is missing choices');
  }

  const allowMultiple = (request.input as MultipleChoiceQuestionInput).allow_multiple === true;
  const rawSelections = allowMultiple ? text.split(',') : [text];
  const selections = rawSelections.map((selection) => selection.trim()).filter(Boolean);

  if (selections.length === 0) {
    throw new Error('Enter one of the listed choices');
  }
  if (!allowMultiple && selections.length > 1) {
    throw new Error('This question accepts exactly one choice');
  }

  const resolved = selections.map((selection) =>
    resolveMultipleChoiceSelection(request, selection, options),
  );

  return allowMultiple ? [...new Set(resolved)] : resolved[0];
}

export function coerceToolResponseValue(request: ToolCall, text: string): unknown {
  if (request.name === 'yes_no_question') {
    return parseYesNoToolResponse(text);
  }
  if (request.name === 'multiple_choice_question') {
    return parseMultipleChoiceToolResponse(request, text);
  }
  return text;
}

function hasOwnResult(response: ToolResponse, key: 'text_result' | 'complex_result') {
  return Object.hasOwn(response, key);
}

function normalizeMultipleChoiceResponseValue(request: ToolCall, value: unknown) {
  const options = getMultipleChoiceOptions(request);
  if (options.length === 0) {
    throw new Error('Multiple choice tool request is missing choices');
  }

  const allowMultiple = (request.input as MultipleChoiceQuestionInput).allow_multiple === true;
  if (Array.isArray(value)) {
    if (!allowMultiple) {
      throw new Error('This question accepts exactly one choice');
    }
    if (value.length === 0) {
      throw new Error('Enter at least one choice');
    }
    return [
      ...new Set(
        value.map((selection) => {
          if (typeof selection !== 'string') {
            throw new Error('Multiple-choice results must be strings');
          }
          return resolveMultipleChoiceSelection(request, selection, options);
        }),
      ),
    ];
  }

  if (typeof value !== 'string') {
    throw new Error('Multiple-choice results must be a string or string array');
  }

  const resolved = resolveMultipleChoiceSelection(request, value, options);
  return allowMultiple ? [resolved] : resolved;
}

export function normalizeToolResponseValue(request: ToolCall, response: ToolResponse): unknown {
  const hasText = hasOwnResult(response, 'text_result');
  const hasComplex = hasOwnResult(response, 'complex_result');

  if (hasText === hasComplex) {
    throw new Error('Tool responses must include exactly one of text_result or complex_result');
  }

  if (hasText) {
    return coerceToolResponseValue(request, response.text_result ?? '');
  }

  const value = (response as { complex_result?: unknown }).complex_result;
  if (request.name === 'yes_no_question') {
    if (typeof value !== 'boolean') {
      throw new Error('Yes/no tool responses must be boolean');
    }
    return value;
  }
  if (request.name === 'multiple_choice_question') {
    return normalizeMultipleChoiceResponseValue(request, value);
  }
  return value;
}
