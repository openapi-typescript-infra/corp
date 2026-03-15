import { serviceTest } from '@justtellme/service-tester';

import type { GraphqlApi } from '#src/types/index.ts';

export const testWithApp = serviceTest.extend<GraphqlApi['ServiceLocals'], object>({});
