import type {
  ConstDirectiveNode,
  DocumentNode,
  FieldDefinitionNode,
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  ObjectTypeDefinitionNode,
} from 'graphql';
import { Kind } from 'graphql';

import { extractTypeName, readPickOmitArguments, replaceNamedType } from './type-utils.ts';

export const AS_INPUT_DIRECTIVE = 'asinput';

export interface AsInputArguments {
  targetType: string;
  pick?: string[];
  omit?: string[];
}

export function addInputTypes(
  schemaAST: DocumentNode,
  toMake: Map<string, AsInputArguments>,
  existingInputs: Map<string, InputObjectTypeDefinitionNode>,
  existing: Map<string, ObjectTypeDefinitionNode>,
): DocumentNode {
  const inputTypeDefinitions: InputObjectTypeDefinitionNode[] = [];

  const fullTypeList = new Map(toMake);

  toMake.forEach((args, typeName) => {
    const types = existing.get(typeName);
    if (!types) {
      throw new Error(`Type ${typeName} not found in existing types, cannot use asinput`);
    }
    const additionalTypes = getAdditionalTypes(types.fields, existing, args);
    additionalTypes.forEach((typeName) => {
      if (!fullTypeList.has(typeName)) {
        fullTypeList.set(typeName, { targetType: typeName });
      }
    });
  });

  fullTypeList.forEach((args, typeName) => {
    const types = existing.get(typeName);
    if (!types) {
      throw new Error(`Type ${typeName} not found in existing types, cannot use asinput`);
    }
    if (!existingInputs.get(`${typeName}Input`)) {
      inputTypeDefinitions.push({
        kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
        description: types.description,
        name: { kind: Kind.NAME, value: `${typeName}Input` },
        fields: objectFieldsToInputFields(types.fields, existing, args),
      });
    }
  });

  return {
    ...schemaAST,
    definitions: [...schemaAST.definitions, ...inputTypeDefinitions],
  };
}

function getAdditionalTypes(
  fields: undefined | readonly FieldDefinitionNode[],
  existing: Map<string, ObjectTypeDefinitionNode>,
  args: AsInputArguments,
): Set<string> {
  const additionalTypes = new Set<string>();
  fields?.forEach((field) => {
    if (args.pick && !args.pick.includes(field.name.value)) {
      return;
    }
    if (args.omit?.includes(field.name.value)) {
      return;
    }
    const typeName = extractTypeName(field.type);
    if (existing.get(typeName)) {
      additionalTypes.add(typeName);
    }
  });
  return additionalTypes;
}

function objectFieldsToInputFields(
  fields: undefined | readonly FieldDefinitionNode[],
  existing: Map<string, ObjectTypeDefinitionNode>,
  args: AsInputArguments,
): undefined | InputValueDefinitionNode[] {
  return fields
    ?.filter((field) => {
      if (args.pick) {
        return args.pick.includes(field.name.value);
      }
      if (args.omit) {
        return !args.omit.includes(field.name.value);
      }
      return field.name?.value !== 'id';
    })
    .map((field) => {
      const type = field.type;
      const isNonNull = type.kind === Kind.NON_NULL_TYPE;
      const namedType = isNonNull ? type.type : type;

      // If this field is also an object type (in existing), we need to change
      // the reference to be the input type
      const typeName = extractTypeName(namedType);
      if (existing.get(typeName)) {
        return {
          ...field,
          kind: Kind.INPUT_VALUE_DEFINITION,
          type: replaceNamedType(field.type, typeName, `${typeName}Input`),
        };
      }
      return {
        ...field,
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: field.name,
        type: field.type,
      };
    });
}

function sameContent(a1?: string[], a2?: string[]) {
  if (!a1 || !a2) {
    return false;
  }
  if (a1.length !== a2.length) {
    return false;
  }
  // We don't care about order
  return a1.every((val) => a2.includes(val)) && a2.every((val) => a1.includes(val));
}

export function addAsInputDirective(
  map: Map<string, AsInputArguments>,
  typename: string,
  directive?: ConstDirectiveNode,
) {
  const directiveArgs: AsInputArguments = {
    targetType: typename,
    ...readPickOmitArguments(directive),
  };
  if (map.has(typename)) {
    // Better be the same pick/omit list or we have a problem
    const existing = map.get(typename) as AsInputArguments;
    if (existing.pick && directiveArgs.pick) {
      if (!sameContent(existing.pick, directiveArgs.pick)) {
        throw new Error(`Conflicting pick lists for ${typename}`);
      }
    }
    return;
  }
  map.set(typename, directiveArgs);
}
