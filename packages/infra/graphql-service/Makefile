# Use node to resolve the service makefile to accommodate pnpm and other linkers
SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/service/Makefile'), import.meta.url).pathname)")
SDL_CONFIG := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/graphql-service/sdl'), import.meta.url).pathname)")
TS_GQL_CONFIG := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/graphql-service/typescript'), import.meta.url).pathname)")

include $(SERVICE_MAKEFILE)

SCHEMA := $(shell find api -type f -name '*.graphql')
GENERATED_GRAPHQL_FILE ?= ./src/generated/schema.graphql
GENERATED_TYPES_FILE ?= ./src/generated/graphql.ts
APOLLO_CONTEXT ?= "@justtellme/graphql-service\#HSGraphQLContext"

graphql: $(GENERATED_GRAPHQL_FILE) $(GENERATED_TYPES_FILE)

$(GENERATED_TYPES_FILE): $(SCHEMA) $(TS_GQL_CONFIG)
	APOLLO_CONTEXT=$(APOLLO_CONTEXT) yarn graphql-codegen --config $(TS_GQL_CONFIG)
	yarn biome format --write $(GENERATED_TYPES_FILE)

$(GENERATED_GRAPHQL_FILE): $(SCHEMA) $(SDL_CONFIG)
	yarn graphql-codegen --config $(SDL_CONFIG)
	yarn biome format --write $(GENERATED_GRAPHQL_FILE)

%.graphql:
	@echo "Detected change in $@"
	@touch $(GENERATED_GRAPHQL_FILE) $(GENERATED_TYPES_FILE)
