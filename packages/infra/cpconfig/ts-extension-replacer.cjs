'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const { newStringRegex } = require('tsc-alias/dist/utils');

// Custom tsc-alias replacer: rewrites .ts/.tsx extensions to .js/.jsx in import paths.
// Runs after the default replacer has resolved #src/ aliases to relative paths.
function replaceTsExtensions({ orig }) {
  const match = orig.match(newStringRegex());
  if (!match?.groups) {
    return orig;
  }
  const importPath = match.groups.path;
  if (importPath.endsWith('.tsx')) {
    return orig.replace(importPath, `${importPath.slice(0, -4)}.jsx`);
  }
  if (importPath.endsWith('.ts')) {
    return orig.replace(importPath, `${importPath.slice(0, -3)}.js`);
  }
  return orig;
}

exports.default = replaceTsExtensions;
