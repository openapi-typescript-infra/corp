import { serviceTest } from '@justtellme/service-tester';

import type { paths } from '#src/generated/service/index.ts';
import type { TaskInternal } from '#src/types/index.ts';

export const testWithApp = serviceTest.extend<TaskInternal['ServiceLocals'], paths>({});
