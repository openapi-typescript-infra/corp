#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';

import React from 'react';
import { render } from 'ink';

import { LocalRunnerApp } from '../app.tsx';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '../../../../../');

render(React.createElement(LocalRunnerApp, { rootDir }), {
  patchConsole: false,
  exitOnCtrlC: true,
});
