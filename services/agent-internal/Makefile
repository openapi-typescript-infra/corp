.PHONY: all build clean

all: service dbi ts

export DB_NAME ?= agent_internal
export SERVICE_NAME ?= agent-internal

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)

generate:
	yarn kysely-codegen --url "postgres://agent-internal:agent-internal-pw@localhost:15432/agent_internal" --out-file ./src/generated/database.ts
	yarn generate-oapi agent-internal
