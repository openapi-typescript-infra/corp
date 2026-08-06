#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'ink';
import React from 'react';

import { LocalRunnerApp } from '../app.tsx';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '../../../../../');

render(React.createElement(LocalRunnerApp, { rootDir }), {
  patchConsole: false,
  exitOnCtrlC: true,
});
