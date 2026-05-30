# Use node to resolve the service makefile to accommodate pnpm and other linkers
SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@openapi-typescript-infra/service/Makefile'), import.meta.url).pathname)")
API_PKG := $(shell node --experimental-import-meta-resolve -e "import fs from 'fs'; import path from 'path'; const p = new URL(import.meta.resolve('@justtellme/${SERVICE_NAME}-client/spec'), import.meta.url).pathname; console.log(fs.realpathSync(path.resolve(p, '../..')))")
API_SPEC := $(API_PKG)/dist/spec.json
TSC = tsgo

# Capture this Makefile's directory BEFORE including (which changes MAKEFILE_LIST)
_SERVICE_ROOT_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
_TSC_ALIAS := $(shell node --experimental-import-meta-resolve -e "import {createRequire} from 'module'; const r = createRequire(import.meta.url); console.log(r.resolve('tsc-alias/dist/bin/index.js'))")

# Filter out rules we redefine below: service generation and ts build
include $(shell _tmp=$$(mktemp) && sed -e '/^src\/generated\/service\/index\.ts:/,/^$$/{d;}' -e '/^\$$(ts_build_stamp):/,/^$$/{d;}' -e '/^src\/generated\/database\.ts:/,/^$$/{d;}' $(SERVICE_MAKEFILE) > $$_tmp && echo $$_tmp)

# Override ts build to handle #src/ subpath imports with .ts extensions:
# 1. Type-check via tsconfig.json (no rewriteRelativeImportExtensions => no TS2877)
# 2. Emit via tsconfig.build.json (TS2877 expected, noEmitOnError:false allows emit)
# 3. tsc-alias rewrites #src/ to relative paths, custom replacer fixes .ts -> .js
$(ts_build_stamp): $(src_files) tsconfig.build.json tsconfig.json $(if $(missing_ts_outputs),FORCE,)
	yarn $(TSC) -p tsconfig.json
	@yarn $(TSC) -p tsconfig.build.json > /dev/null 2>&1 || true
	node $(_TSC_ALIAS) --project tsconfig.build.json -r $(__SERVICE_ROOT_DIR)ts-extension-replacer.cjs
	@mkdir -p $(build_dir)
	@touch $@

K8S_ENV ?= development
ifeq ($(K8S_ENV),production)
	GCP_PROJECT ?= justtellme-prod
else
	GCP_PROJECT ?= justtellme-dev
endif

helm-template:
	@echo "hs-base-service:" > ops/$(SERVICE_NAME)/values.local.yaml
	@echo "  gcp:" >> ops/$(SERVICE_NAME)/values.local.yaml
	@echo "    env: $(K8S_ENV)" >> ops/$(SERVICE_NAME)/values.local.yaml
	@echo "    project: $(GCP_PROJECT)" >> ops/$(SERVICE_NAME)/values.local.yaml
	@echo "  changeCause: \"local template run\"" >> ops/$(SERVICE_NAME)/values.local.yaml
	@echo "  tag: untagged" >> ops/$(SERVICE_NAME)/values.local.yaml

	helm dependency update ops/$(SERVICE_NAME)
	@if [ -f ops/$(SERVICE_NAME)/values.$(K8S_ENV).yaml ]; then \
		cd ops/$(SERVICE_NAME) && helm template -f values.$(K8S_ENV).yaml -f values.local.yaml .; \
	else \
		cd ops/$(SERVICE_NAME) && helm template -f values.local.yaml .; \
	fi

	@rm ops/$(SERVICE_NAME)/values.local.yaml

init:
	yarn
	@if [ -z "$(DB_NAME)" ]; then \
		echo "DB_NAME is not set. Skipping dev database."; \
	else \
		$(MAKE) -C $$(git rev-parse --show-toplevel) ensure-dev-db; \
		yarn db:create; \
		yarn migration:apply; \
	fi

ACTIONS_DIRECTORY ?= ../github-actions
DOCKER_REGISTRY ?= us-docker.pkg.dev/justtellme-dev/docker-images
GITHUB_SHA ?= $(shell git rev-parse HEAD)
RUN_NUMBER ?= 0

# Build a docker image suitable for deployment
# Requires GITHUB_SHA and RUN_NUMBER
container:
#	Ensure expected directories exist
	touch api
	touch private
	touch public
	touch migrations
	touch README.md
	touch src/config
	$(eval USE_CACHE=$(shell if docker pull $(DOCKER_REGISTRY)/$(SERVICE_NAME):latest; then echo "--cache-from $(DOCKER_REGISTRY)/$(SERVICE_NAME):latest"; else echo ""; fi))
	docker build \
	  --build-arg GOOGLE_PACKAGES_TOKEN=$(shell if [ -f ./.npmrc ]; then sed -n 's/.*_authToken=\(.*\)/\1/gp' ./.npmrc; else sed -n 's/.*_authToken=\(.*\)/\1/gp' ~/.npmrc; fi) \
	  --build-arg BUILD_VERSION=$(shell node -p "const fs=require('fs'); let pkg=JSON.parse(fs.readFileSync('./package.json')); const parts=pkg.version.split('.'); parts[2]='$(RUN_NUMBER)'; parts.join('.')") \
		--build-context monorepo=../.. \
	  --network=host $(USE_CACHE) \
	  --tag $(DOCKER_REGISTRY)/$(SERVICE_NAME):$(GITHUB_SHA) \
	  --tag $(DOCKER_REGISTRY)/$(SERVICE_NAME):latest . \
	  -f ../../docker/service.Dockerfile

check:
	yarn biome check --write src

typecheck: check
	make ts

# Ensure the service database exists before generating types.
# On first run: starts postgres, creates the DB/user, and applies migrations.
# On subsequent runs: SELECT 1 succeeds and this is a no-op.
.PHONY: ensure-service-db
ensure-service-db:
ifdef DB_NAME
	@yarn run-pg-sql $(DB_NAME) -q -e 'SELECT 1' 2>/dev/null || \
		($(MAKE) -C $$(git rev-parse --show-toplevel) ensure-dev-db && $(MAKE) db-ci)
endif

# Override upstream database.ts rule to ensure DB exists first.
# The order-only prerequisite (|) means ensure-service-db won't trigger
# a rebuild by itself — only migration file changes do that.
src/generated/database.ts: $(wildcard migrations/* migrations/**/*) | ensure-service-db
ifdef DB_NAME
	echo "Generating database types"
	yarn migration:apply
	envfile=$$(mktemp) && \
	echo "DATABASE_URL=postgres://$(PGUSER):$(PGPASSWORD)@$(PGHOST):$(PGPORT)/$(DB_NAME)" > $$envfile && \
	yarn kysely-codegen \
		--env-file $$envfile \
		--dialect postgres \
		--default-schema public \
		--out-file src/generated/database.ts
endif

apicheck:
	BUNDLE_OUTPUT=$$(mktemp -d); \
	make bundlespec BUNDLE_OUTPUT="$$BUNDLE_OUTPUT"; \
	npx openapi-typescript "$$BUNDLE_OUTPUT/openapi-spec.json" --enum-values -o "$$BUNDLE_OUTPUT/client.ts"; \
	yarn tsc --noEmit --skipLibCheck "$$BUNDLE_OUTPUT/client.ts"

# Ensure the API package spec is built (cross-package dependency)
$(API_SPEC): api-build

.PHONY: api-build

api-build:
	$(MAKE) -C $(API_PKG) all

# Redefines the way api specs are made
src/generated/service/index.ts: $(API_SPEC)
	echo "Building service interface"
ifndef BUNDLE_OUTPUT
		$(eval BUNDLE_OUTPUT := $(shell mktemp -d))
		$(eval GENERATED_DIR := true)
endif
	yarn dlx openapi-typescript-express $(API_SPEC) \
		--output ./src/generated/service/index.ts
ifdef GENERATED_DIR
		rm -rf $(BUNDLE_OUTPUT)
endif
