import type { ConstDirectiveNode, StringValueNode, TypeNode } from 'graphql';
import { Kind } from 'graphql';

export function extractTypeName(typeNode: TypeNode): string {
  if (typeNode.kind === Kind.NAMED_TYPE) {
    return typeNode.name.value;
  } else if (typeNode.kind === Kind.LIST_TYPE || typeNode.kind === Kind.NON_NULL_TYPE) {
    return extractTypeName(typeNode.type); // Recursively extract the name from wrapped types
  } else {
    throw new Error('Unsupported type node encountered');
  }
}

export function replaceNamedType<T extends TypeNode>(
  typeNode: T,
  originalType: string,
  newType: string,
): T {
  if (typeNode.kind === Kind.NAMED_TYPE) {
    if (typeNode.name.value === originalType) {
      return {
        ...typeNode,
        name: { kind: Kind.NAME, value: newType },
      };
    }
    return typeNode;
  }
  if (typeNode.kind === Kind.LIST_TYPE) {
    return {
      ...typeNode,
      type: replaceNamedType(typeNode.type, originalType, newType),
    };
  }
  if (typeNode.kind === Kind.NON_NULL_TYPE) {
    return {
      ...typeNode,
      type: replaceNamedType(typeNode.type, originalType, newType),
    };
  } else {
    throw new Error('Unsupported type node encountered');
  }
}

export function readPickOmitArguments(directive?: ConstDirectiveNode) {
  const directiveArgs: { pick?: string[]; omit?: string[] } = {};
  const pickArg = directive?.arguments?.find((arg) => arg.name.value === 'pick')?.value;
  const omitArg = directive?.arguments?.find((arg) => arg.name.value === 'omit')?.value;
  if (pickArg?.kind === Kind.LIST) {
    directiveArgs.pick = pickArg.values.map((val) => (val as StringValueNode).value);
  } else if (pickArg?.kind === Kind.STRING) {
    directiveArgs.pick = [(pickArg as StringValueNode).value];
  }
  if (omitArg?.kind === Kind.LIST) {
    directiveArgs.omit = omitArg.values.map((val) => (val as StringValueNode).value);
  } else if (omitArg?.kind === Kind.STRING) {
    directiveArgs.omit = [(omitArg as StringValueNode).value];
  }
  return directiveArgs;
}
