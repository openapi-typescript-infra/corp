/**
 * A GraphQL codegen plugin to simplify SDL authoring
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PluginFunction, Types } from '@graphql-codegen/plugin-helpers';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import type {
  ASTVisitor,
  DocumentNode,
  FieldDefinitionNode,
  InputObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  ObjectTypeDefinitionNode,
} from 'graphql';
import { Kind, parse, print, visit } from 'graphql';
import type { IncludesArguments } from './includes.ts';
import { addIncludedFields, INCLUDE_DIRECTIVE, readInclude } from './includes.ts';
import type { AsInputArguments } from './input-types.ts';
import { AS_INPUT_DIRECTIVE, addAsInputDirective, addInputTypes } from './input-types.ts';
import { addPaginatedTypes, fieldPaginationArguments } from './pagination-types.ts';
import { extractTypeName, replaceNamedType } from './type-utils.ts';

interface EnhancedPluginConfig {
  sdlOutputFile: string;
}

export const enhanced: PluginFunction<EnhancedPluginConfig> = (
  schema,
  _document,
  config,
): Types.PluginOutput => {
  const inSchema = printSchemaWithDirectives(schema);
  const schemaAST: DocumentNode = parse(inSchema);

  const transformedSchema: DocumentNode = transformSchema(schemaAST);
  const finalSdl = print(transformedSchema);
  if (config.sdlOutputFile) {
    const outputPath = path.resolve(process.cwd(), config.sdlOutputFile);
    fs.writeFileSync(outputPath, finalSdl, 'utf-8');
  }

  return {
    content: finalSdl,
  };
};

function transformSchema(schemaAST: DocumentNode): DocumentNode {
  const paginatedTypes = new Set<string>();
  const virtualInputTypes = new Map<string, AsInputArguments>();
  const objectTypes = new Map<string, ObjectTypeDefinitionNode>();
  const realInputTypes = new Map<string, InputObjectTypeDefinitionNode>();
  const includes: IncludesArguments[] = [];

  const interfaces: Record<string, InterfaceTypeDefinitionNode> = {};
  visit(schemaAST, {
    InterfaceTypeDefinition(node) {
      interfaces[node.name.value] = node;
    },
  });

  const visitor: ASTVisitor = {
    InputObjectTypeDefinition(node) {
      if (node.directives?.some((d) => d.name.value === INCLUDE_DIRECTIVE)) {
        const includeDirective = readInclude(node);
        includes.push(includeDirective);
      }
      realInputTypes.set(node.name.value, node);
      const updatedFields = node.fields?.map((field) => {
        const asInput = field.directives?.find((d) => d.name.value === AS_INPUT_DIRECTIVE);
        if (asInput) {
          const typeName = extractTypeName(field.type);
          addAsInputDirective(virtualInputTypes, typeName, asInput);
          return {
            ...field,
            type: replaceNamedType(field.type, typeName, `${typeName}Input`),
            directives: field.directives?.filter((d) => d !== asInput),
          };
        }
        return field;
      });
      return {
        ...node,
        fields: updatedFields,
      };
    },
    FieldDefinition(node) {
      if (node.directives?.some((directive) => directive.name.value === 'paginated')) {
        const typeName = extractTypeName(node.type);

        const newNode: FieldDefinitionNode = {
          ...node,
          type: {
            kind: Kind.NAMED_TYPE,
            name: { kind: Kind.NAME, value: `${typeName}Connection` },
          },
          directives: node.directives.filter((directive) => directive.name.value !== 'paginated'),
          arguments: [...(node.arguments || []), ...fieldPaginationArguments()],
        };
        paginatedTypes.add(typeName);
        return newNode;
      }
    },
    ObjectTypeDefinition(node) {
      const newFields: FieldDefinitionNode[] = [];
      if (node.directives?.some((d) => d.name.value === AS_INPUT_DIRECTIVE)) {
        const asInput = node.directives?.find((d) => d.name.value === AS_INPUT_DIRECTIVE);
        addAsInputDirective(virtualInputTypes, node.name.value, asInput);
      }
      if (node.interfaces) {
        node.interfaces.forEach((iface) => {
          const ifaceName = iface.name.value;
          const ifaceNode = interfaces[ifaceName];
          if (ifaceNode) {
            // Copy fields from interface if not already present in the type
            ifaceNode.fields?.forEach((field) => {
              if (
                !node.fields?.some((f) => f.name.value === field.name.value) &&
                !newFields.some((f) => f.name.value === field.name.value)
              ) {
                newFields.push(field);
              }
            });
          }
        });
      }

      if (newFields.length > 0) {
        const newType = {
          ...node,
          fields: [...(node.fields || []), ...newFields],
        };
        objectTypes.set(node.name.value, newType);
        // Return a new node with the combined fields if new fields were added
        return newType;
      }
      objectTypes.set(node.name.value, node);
    },
  };
  const transformed = visit(schemaAST, visitor);
  const withIncludes = addIncludedFields(transformed, includes, virtualInputTypes);
  const withPagination = addPaginatedTypes(withIncludes, paginatedTypes);
  const withInputs = addInputTypes(withPagination, virtualInputTypes, realInputTypes, objectTypes);
  return withInputs;
}
