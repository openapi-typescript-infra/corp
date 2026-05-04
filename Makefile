export PGUSER ?= postgres
export PGPASSWORD ?= postgres
export PGHOST ?= localhost
export PGPORT ?= 25432

export TYPESENSE_HOST ?= localhost
export TYPESENSE_PORT ?= 28108

export TEMPORAL_HOST ?= localhost
export TEMPORAL_PORT ?= 27233
export TEMPORAL_UI_PORT ?= 28233
export TEMPORAL_NAMESPACE ?= justtellme

export PUBSUB_PORT ?= 28085
export PUBSUB_PROJECT_ID ?= justtellme-dev

.PHONY: ensure-dev-db dev-postgres-create dev-typesense dev-temporal dev-pubsub db-clean check

dev-postgres-create:
	@if docker ps -a --format '{{.Names}}' | grep -q '^jtmpg$$'; then \
		docker start jtmpg 2>/dev/null || true; \
	else \
		docker run -d --name jtmpg --env=POSTGRES_PASSWORD=postgres \
			--shm-size=2g \
			-v jtmpg-data:/var/lib/postgresql/data \
			--health-cmd "pg_isready -U postgres" --health-interval 10s --health-timeout 5s --health-retries 5 \
			-p 25432:5432 ghcr.io/openapi-typescript-infra/pg-postgis-plv8:main; \
	fi
	@printf "Waiting for Postgres container.";
	@while [ $$(docker inspect --format='{{.State.Health.Status}}' jtmpg) != "healthy" ]; do \
		sleep 2; \
		printf '.'; \
	done
	@echo "ready"
	@yarn run-pg-sql postgres -q -e "CREATE USER \"dbowner\" WITH PASSWORD 'onlyindev'; ALTER USER dbowner WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION;" 2>/dev/null || true

ensure-dev-db:
	@yarn run-pg-sql postgres -q -e 'SELECT 1' 2>/dev/null || make dev-postgres-create

dev-typesense:
	@if docker ps -a --format '{{.Names}}' | grep -q '^jtmtypesense$$'; then \
		docker start jtmtypesense 2>/dev/null || true; \
	else \
		docker run -d --name jtmtypesense \
			-v jtmtypesense-data:/data \
			--health-cmd "wget -qO- http://localhost:8108/health || exit 1" --health-interval 10s --health-timeout 5s --health-retries 5 \
			-p $(TYPESENSE_PORT):8108 typesense/typesense:28.0 \
			--data-dir /data --api-key=$(TYPESENSE_API_KEY) --enable-cors; \
	fi
	@printf "Waiting for Typesense container.";
	@while [ $$(docker inspect --format='{{.State.Health.Status}}' jtmtypesense) != "healthy" ]; do \
		sleep 2; \
		printf '.'; \
	done
	@echo "ready"

dev-temporal:
	@if docker ps -a --format '{{.Names}}' | grep -q '^jtmtemporal$$'; then \
		docker start jtmtemporal 2>/dev/null || true; \
	else \
		docker run -d --name jtmtemporal \
			-v jtmtemporal-data:/home/temporal \
			--health-cmd "wget -qO- http://localhost:8233/ || exit 1" --health-interval 10s --health-timeout 5s --health-retries 5 \
			-p $(TEMPORAL_PORT):7233 -p $(TEMPORAL_UI_PORT):8233 temporalio/temporal:latest \
			server start-dev --ip 0.0.0.0 --ui-ip 0.0.0.0 --db-filename /home/temporal/temporal.db --log-level info; \
	fi
	@printf "Waiting for Temporal container.";
	@while [ $$(docker inspect --format='{{.State.Health.Status}}' jtmtemporal) != "healthy" ]; do \
		sleep 2; \
		printf '.'; \
	done
	@echo "ready"
	@docker exec jtmtemporal temporal operator namespace describe --namespace $(TEMPORAL_NAMESPACE) >/dev/null 2>&1 \
		|| docker exec jtmtemporal temporal operator namespace create --namespace $(TEMPORAL_NAMESPACE) --retention 72h \
			--description "$(TEMPORAL_NAMESPACE) project namespace"

dev-pubsub:
	@if docker ps -a --format '{{.Names}}' | grep -q '^jtmpubsub$$'; then \
		docker start jtmpubsub 2>/dev/null || true; \
	else \
		docker run -d --name jtmpubsub \
			-e PUBSUB_PROJECT_ID=$(PUBSUB_PROJECT_ID) \
			-p $(PUBSUB_PORT):8681 \
			messagebird/gcloud-pubsub-emulator:latest; \
	fi
	@printf "Waiting for Pub/Sub emulator.";
	@until nc -z localhost $(PUBSUB_PORT) 2>/dev/null; do sleep 2; printf '.'; done
	@echo "ready"
	@PUBSUB_EMULATOR_HOST=localhost:$(PUBSUB_PORT) PUBSUB_PROJECT_ID=$(PUBSUB_PROJECT_ID) \
		node scripts/pubsub-create-topics.mjs

db-clean: ensure-dev-db
	yarn db:clean

check:
	yarn lint:fix && yarn typecheck
