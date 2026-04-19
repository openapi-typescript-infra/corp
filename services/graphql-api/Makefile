.PHONY: all build clean graphql graphql-lint

all: graphql ts

graphql-lint: graphql
	@echo "Linting GraphQL files..."
	@yarn biome check src/generated/schema.graphql

export SERVICE_NAME ?= graphql-api
export APOLLO_CONTEXT ?= "../types/context.ts\#GraphQLApiContext"

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/graphql-service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)
