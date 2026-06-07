import path from 'node:path';
import { getFilesInDir } from '@openapi-typescript-infra/service';
import { isFunction, isObject, mergeWith } from 'lodash-es';

export async function loadResolvers(rootDirectory: string, codepath: string) {
  const codePattern = codepath === 'src' ? '**/*.ts' : '**/*.js';
  const resolverBase = path.resolve(rootDirectory, codepath, 'resolvers');
  const resolverFiles = await getFilesInDir(codePattern, resolverBase);

  let Query: Record<string, unknown> | undefined;
  let Mutation: Record<string, unknown> | undefined;
  let Types: Record<string, unknown> | undefined;

  await Promise.all(
    resolverFiles.map(async (file: string) => {
      const m = await import(path.resolve(resolverBase, file));

      if (m.resolvers) {
        const resolvers = m.resolvers as {
          Query: Record<string, unknown>;
          Mutation: Record<string, unknown>;
        } & Record<string, unknown>;

        // Dig into Query and Mutation values and merge elements, but also copy any type resolvers.
        const { Query: moduleQuery, Mutation: moduleMutation, ...rest } = resolvers;
        if (moduleQuery) {
          Query = Query || {};
          for (const key in moduleQuery) {
            if (Query[key]) {
              throw new Error(`Duplicate Query resolver for ${key}`);
            }
            Query[key] = moduleQuery[key];
          }
        }
        if (moduleMutation) {
          Mutation = Mutation || {};
          for (const key in moduleMutation) {
            if (Mutation[key]) {
              throw new Error(`Duplicate Mutation resolver for ${key}`);
            }
            Mutation[key] = moduleMutation[key];
          }
        }

        const customizer: Parameters<typeof mergeWith>[2] = (
          objValue: Record<string, unknown>,
          srcValue: Record<string, unknown>,
          key: string,
        ) => {
          if (isFunction(objValue) || isFunction(srcValue)) {
            if (objValue && srcValue) {
              throw new Error(`Duplicate resolver detected for ${key}`);
            }
            // Prefer srcValue if it's defined, otherwise keep objValue
            return srcValue ?? objValue;
          }
          if (isObject(objValue) && isObject(srcValue)) {
            return mergeWith({}, objValue, srcValue, customizer);
          }
          return srcValue;
        };

        Types = Types || {};
        mergeWith(Types, rest, customizer);
      }
    }),
  );
  return {
    ...Types,
    ...(Query ? { Query } : undefined),
    ...(Mutation ? { Mutation } : undefined),
  };
}
