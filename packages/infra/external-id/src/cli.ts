#!/usr/bin/env node
import { runExternalIDCli } from '@openapi-typescript-infra/external-id/cli';

import * as externalID from './index.ts';

await runExternalIDCli(externalID);
