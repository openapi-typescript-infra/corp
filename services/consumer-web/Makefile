.PHONY: all build clean

all: service

export SERVICE_NAME ?= consumer-web

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/web-service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)

API_SPEC := ./api/consumer-web.yaml
