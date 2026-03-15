import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

function hasPackage(name: string) {
  try {
    // Try to resolve from current working directory context
    const requireFn = typeof require !== 'undefined' ? require : createRequire(import.meta.url);
    const resolvedPath = requireFn.resolve(name, {
      paths: [path.resolve(process.cwd())],
    });
    return !!resolvedPath;
  } catch {
    return false;
  }
}

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const YAML_SENTINEL = '# Managed by cpconfig';
const JSON_SENTINEL = '"Managed by cpconfig"';
const JS_SENTINEL = '// Managed by cpconfig';

function replacePlaceholder(ph: string, text: string, value: string) {
  return text.replace(new RegExp(`{{${ph}}}`), value);
}

export function config(pkgJson: Record<string, unknown>) {
  const deps = (pkgJson.dependencies || {}) as Record<string, string>;
  const config = (pkgJson.config as { eslintignore?: string[]; skip?: string[] }) || {};
  const shouldWriteGitHook = (() => {
    try {
      return fs.statSync(path.resolve(process.cwd(), '.git')).isDirectory();
    } catch {
      return false;
    }
  })();

  const allValues = {
    '.commitlintrc.yaml': {
      contents: fs.readFileSync(path.resolve(__dirname, '../templates/.commitlintrc.yaml'), 'utf8'),
      sentinel: YAML_SENTINEL,
    },
    'eslint.config.mts': {
      contents: replacePlaceholder(
        'ignores',
        fs.readFileSync(path.resolve(__dirname, '../templates/eslint.config.mts.template'), 'utf8'),
        JSON.stringify(config?.eslintignore || []),
      ),
      sentinel: JS_SENTINEL,
    },
    'tsconfig.json': {
      contents: fs.readFileSync(path.resolve(__dirname, '../templates/tsconfig.json'), 'utf8'),
      sentinel: JSON_SENTINEL,
    },
    'tsconfig.build.json': {
      contents: fs.readFileSync(
        path.resolve(__dirname, '../templates/tsconfig.build.json'),
        'utf8',
      ),
      sentinel: JSON_SENTINEL,
    },
    '.prettierrc.yaml': {
      contents: fs.readFileSync(path.resolve(__dirname, '../templates/.prettierrc.yaml'), 'utf8'),
      sentinel: YAML_SENTINEL,
    },
    'vitest.config.ts': {
      contents: fs.readFileSync(
        path.resolve(__dirname, '../templates/vitest.config.ts.template'),
        'utf8',
      ),
      sentinel: JS_SENTINEL,
    },
    ...(shouldWriteGitHook
      ? {
          '.git/hooks/commit-msg': {
            contents: fs.readFileSync(
              path.resolve(__dirname, '../templates/commit-msg.template'),
              'utf8',
            ),
            sentinel: YAML_SENTINEL,
            mode: '755',
            gitignore: false,
          },
        }
      : undefined),
    ...(deps.next
      ? {
          'next.config.js': {
            contents: fs.readFileSync(
              path.resolve(__dirname, '../templates/next.config.js'),
              'utf8',
            ),
            sentinel: JS_SENTINEL,
          },
        }
      : undefined),
    ...(deps.graphql
      ? {
          'graphql.config.yml': {
            contents: fs.readFileSync(
              path.resolve(__dirname, '../templates/graphql.config.yml'),
              'utf8',
            ),
            sentinel: YAML_SENTINEL,
          },
        }
      : undefined),
    ...(hasPackage('tsup')
      ? {
          'tsconfig.tsup.json': {
            contents: fs.readFileSync(
              path.resolve(__dirname, '../templates/tsconfig.tsup.json'),
              'utf8',
            ),
            sentinel: JSON_SENTINEL,
          },
        }
      : undefined),
  };

  if (Array.isArray(config.skip)) {
    for (const key of config.skip) {
      delete allValues[key as keyof typeof allValues];
    }
  }

  return allValues;
}
