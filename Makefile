export PGUSER ?= postgres
export PGPASSWORD ?= postgres
export PGHOST ?= localhost
export PGPORT ?= 15432

.PHONY: ensure-dev-db dev-postgres-create check

dev-postgres-create:
	@if docker ps -a --format '{{.Names}}' | grep -q '^jtmpg$$'; then \
		docker start jtmpg 2>/dev/null || true; \
	else \
		docker run -d --name jtmpg --env=POSTGRES_PASSWORD=postgres \
			--health-cmd "pg_isready -U postgres" --health-interval 10s --health-timeout 5s --health-retries 5 \
			-p 15432:5432 ghcr.io/openapi-typescript-infra/pg-postgis-plv8:main; \
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

check:
	yarn format && yarn typecheck
