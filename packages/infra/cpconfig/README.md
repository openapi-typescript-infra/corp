# @justtellme/cpconfig

Shared configuration files for Just Tell Me Typescript projects

- tsconfig.json - modern Node24+ Next-compatible, noEmit
- tsconfig.build.json - emits to dist
- tsconfig.tsup.json - disables incremental compilation
- .commitlintrc.yaml - force conventional commit format
- biome.jsonc - lint and format rules
- vitest.config.ts - test framework setup
- .git/hooks/commit-msg - enforce commitlint rules

More to come, including NextJS infra. This module uses cpconfig to manage getting these files in place, typically from a postinstall hook.
