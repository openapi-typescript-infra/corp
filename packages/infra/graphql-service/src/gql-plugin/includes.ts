import type {
  ASTVisitor,
  DocumentNode,
  FieldDefinitionNode,
  InputObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  ObjectTypeDefinitionNode,
} from 'graphql';
import { Kind, visit } from 'graphql';
import type { AsInputArguments } from './input-types.ts';
import { addAsInputDirective } from './input-types.ts';
import { extractTypeName, readPickOmitArguments, replaceNamedType } from './type-utils.ts';

export interface IncludesArguments {
  sourceType: string;
  targetType: string;

  pick?: string[];
  omit?: string[];
}

export const INCLUDE_DIRECTIVE = 'includes';

export function readInclude(schemaAST: InputObjectTypeDefinitionNode): IncludesArguments {
  const directive = schemaAST.directives?.find((d) => d.name.value === INCLUDE_DIRECTIVE);
  if (!directive) {
    throw new Error(`Missing @${INCLUDE_DIRECTIVE} directive on ${schemaAST.name.value}`);
  }

  const sourceType = schemaAST.name.value;
  const targetType = directive.arguments?.find((arg) => arg.name.value === 'type')?.value;
  if (!targetType) {
    throw new Error(`Missing type argument on @${INCLUDE_DIRECTIVE} directive on ${sourceType}`);
  }
  if (targetType.kind !== Kind.STRING) {
    throw new Error(
      `Expected type argument on @${INCLUDE_DIRECTIVE} directive on ${sourceType} to be a string`,
    );
  }

  return {
    sourceType,
    targetType: targetType.value,
    ...readPickOmitArguments(directive),
  };
}

function getTargetType(
  schemaAST: DocumentNode,
  name: string,
): { fields?: readonly FieldDefinitionNode[] } | undefined {
  const target = schemaAST.definitions.find((def) => {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (def.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_DEFINITION:
        return def.name.value === name;
      default:
        return false;
    }
  });
  return target as ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode | undefined;
}

export function addIncludedFields(
  schemaAST: DocumentNode,
  directives: IncludesArguments[],
  asInput: Map<string, AsInputArguments>,
): DocumentNode {
  const visitor: ASTVisitor = {
    InputObjectTypeDefinition(node) {
      const includeDirective = directives.find((d) => d.sourceType === node.name.value);
      if (includeDirective) {
        const target = getTargetType(schemaAST, includeDirective.targetType);
        const fields = target?.fields;

        if (!fields) {
          throw new Error(`Type ${node.name.value} does not exist or has no fields`);
        }

        return {
          ...node,
          directives: node.directives?.filter((d) => d.name.value !== INCLUDE_DIRECTIVE),
          fields: [
            ...(node.fields || []),
            fields
              .filter((f) => {
                if (includeDirective.pick && !includeDirective.pick.includes(f.name.value)) {
                  return false;
                }
                if (includeDirective.omit && includeDirective.omit.includes(f.name.value)) {
                  return false;
                }
                const targetType = extractTypeName(f.type);
                if (getTargetType(schemaAST, targetType)) {
                  // Need to treat this asInput
                  if (!asInput.has(targetType)) {
                    addAsInputDirective(asInput, targetType);
                  }
                }
                return true;
              })
              .map((f) => {
                const targetType = extractTypeName(f.type);
                if (getTargetType(schemaAST, targetType)) {
                  return {
                    ...f,
                    type: replaceNamedType(f.type, targetType, `${targetType}Input`),
                  };
                }
                return f;
              }),
          ],
        };
      }
      return node;
    },
  };
  return visit(schemaAST, visitor);
}
