.PHONY: all build clean

all: service dbi ts

export DB_NAME ?= agent
export SERVICE_NAME ?= agent-internal

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)

generate: service dbi
