import type { FiltrexType } from '@sesamecare-oss/async-rule-evaluator';

export const RequestFunctions = {
  hasGroup(this: (prop: string) => FiltrexType, group: string) {
    return this('groups').then((roles?: string[]) => !!roles?.includes(group));
  },
  hasScope(this: (prop: string) => FiltrexType, scope: string) {
    return this('scopes').then((scopes?: string[]) => !!scopes?.includes(scope));
  },
  hasPermission(this: (prop: string) => FiltrexType, perm: string) {
    return this('permissions').then((perms?: string[]) => !!perms?.includes(perm));
  },
};
