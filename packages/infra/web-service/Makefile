# Use node to resolve the service makefile to accommodate pnpm and other linkers
SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/service/Makefile'), import.meta.url).pathname)")

include $(SERVICE_MAKEFILE)

SCHEMA ?= $(shell find ./src -type f -name '*.graphql')
GRAPHQL_ENDPOINT ?= https://api.dev.justtellme.com/graphql
GRAPHQL_CONFIG ?= ./codegen.yml

graphql: src/generated/graphql-api.ts $(GRAPHQL_CONFIG)

src/generated/graphql-api.ts: $(SCHEMA)
	GRAPHQL_ENDPOINT=$(GRAPHQL_ENDPOINT) $(SWS_DIR)../../.bin/graphql-codegen --config $(GRAPHQL_CONFIG)
