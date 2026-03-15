# Makefiles are useful for slightly more complex scenarios than npm scripts can easily handle.
# You can use gulp or whatever other thing you like, but we prefer the simplicity of Make.

.PHONY: all build clean

all: service

export SERVICE_NAME ?= authn-authz-internal

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)
