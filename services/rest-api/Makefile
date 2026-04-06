.PHONY: all build clean

all: service ts

export SERVICE_NAME ?= rest-api

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)
