#!/usr/bin/env node
import { render } from 'ink';
import path from 'path';

import React from 'react';
import { fileURLToPath } from 'url';

import { LocalRunnerApp } from '../app.tsx';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '../../../../../');

render(React.createElement(LocalRunnerApp, { rootDir }), {
  patchConsole: false,
  exitOnCtrlC: true,
});
