import type { DocumentNode, InputValueDefinitionNode, ObjectTypeDefinitionNode } from 'graphql';
import { Kind } from 'graphql';

function generatePageInfoType(): ObjectTypeDefinitionNode {
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    description: {
      kind: Kind.STRING,
      block: true,
      value: 'Information about pagination in a connection.',
    },
    name: { kind: Kind.NAME, value: 'PageInfo' },
    fields: [
      {
        kind: Kind.FIELD_DEFINITION,
        description: {
          kind: Kind.STRING,
          block: true,
          value: 'When paginating forwards, are there more items?',
        },
        name: { kind: Kind.NAME, value: 'hasNextPage' },
        type: {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.NAMED_TYPE,
            name: { kind: Kind.NAME, value: 'Boolean' },
          },
        },
        directives: [],
      },
      {
        kind: Kind.FIELD_DEFINITION,
        description: {
          kind: Kind.STRING,
          block: true,
          value: 'When paginating backwards, are there more items?',
        },
        name: { kind: Kind.NAME, value: 'hasPreviousPage' },
        type: {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.NAMED_TYPE,
            name: { kind: Kind.NAME, value: 'Boolean' },
          },
        },
        directives: [],
      },
      {
        kind: Kind.FIELD_DEFINITION,
        description: {
          kind: Kind.STRING,
          block: true,
          value: 'When paginating backwards, the cursor to continue.',
        },
        name: { kind: Kind.NAME, value: 'startCursor' },
        type: {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: 'String' },
        },
        directives: [],
      },
      {
        kind: Kind.FIELD_DEFINITION,
        description: {
          kind: Kind.STRING,
          block: true,
          value: 'When paginating forwards, the cursor to continue.',
        },
        name: { kind: Kind.NAME, value: 'endCursor' },
        type: {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: 'String' },
        },
        directives: [],
      },
    ],
    directives: [],
  };
}

export function addPaginatedTypes(schemaAST: DocumentNode, types: Set<string>): DocumentNode {
  const paginationTypeDefinitions: ObjectTypeDefinitionNode[] = [];

  types.forEach((typeName) => {
    const connectionTypeName = `${typeName}Connection`;
    const edgeTypeName = `${typeName}Edge`;

    const connectionType: ObjectTypeDefinitionNode = {
      kind: Kind.OBJECT_TYPE_DEFINITION,
      name: { kind: Kind.NAME, value: connectionTypeName },
      description: {
        kind: Kind.STRING,
        block: true,
        value: `A connection to a paged list of ${typeName}.`,
      },
      fields: [
        {
          kind: Kind.FIELD_DEFINITION,
          name: { kind: Kind.NAME, value: 'edges' },
          description: {
            kind: Kind.STRING,
            block: true,
            value: 'A list of edges in the graph.',
          },
          type: {
            kind: Kind.LIST_TYPE,
            type: {
              kind: Kind.NON_NULL_TYPE,
              type: {
                kind: Kind.NAMED_TYPE,
                name: { kind: Kind.NAME, value: edgeTypeName },
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: { kind: Kind.NAME, value: 'totalCount' },
          description: {
            kind: Kind.STRING,
            block: true,
            value: 'The total count of items in the connection, if available',
          },
          type: {
            kind: Kind.NAMED_TYPE,
            name: { kind: Kind.NAME, value: 'Int' },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          description: {
            kind: Kind.STRING,
            block: true,
            value: 'Information to aid in pagination.',
          },
          name: { kind: Kind.NAME, value: 'pageInfo' },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: { kind: Kind.NAME, value: 'PageInfo' },
            },
          },
        },
      ],
    };

    // Create XXEdge type
    const edgeType: ObjectTypeDefinitionNode = {
      kind: Kind.OBJECT_TYPE_DEFINITION,
      name: { kind: Kind.NAME, value: edgeTypeName },
      description: {
        kind: Kind.STRING,
        block: true,
        value: `An edge in a connection to a paged list of ${typeName}.`,
      },
      fields: [
        {
          kind: Kind.FIELD_DEFINITION,
          name: { kind: Kind.NAME, value: 'cursor' },
          description: {
            kind: Kind.STRING,
            block: true,
            value: 'A cursor for use in pagination.',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: { kind: Kind.NAME, value: 'String' },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: { kind: Kind.NAME, value: 'node' },
          description: {
            kind: Kind.STRING,
            block: true,
            value: 'The item at the end of the edge.',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: { kind: Kind.NAME, value: typeName },
            },
          },
        },
      ],
    };

    paginationTypeDefinitions.push(connectionType, edgeType);
  });

  return {
    ...schemaAST,
    definitions: [...schemaAST.definitions, generatePageInfoType(), ...paginationTypeDefinitions],
  };
}

export function fieldPaginationArguments() {
  return [
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: Kind.NAME, value: 'first' },
      type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'Int' } },
    },
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: Kind.NAME, value: 'last' },
      type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: 'Int' } },
    },
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: Kind.NAME, value: 'after' },
      type: {
        kind: Kind.NAMED_TYPE,
        name: { kind: Kind.NAME, value: 'String' },
      },
    },
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: Kind.NAME, value: 'before' },
      type: {
        kind: Kind.NAMED_TYPE,
        name: { kind: Kind.NAME, value: 'String' },
      },
    },
  ] as InputValueDefinitionNode[];
}
