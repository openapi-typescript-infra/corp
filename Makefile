export PGUSER ?= postgres
export PGPASSWORD ?= postgres
export PGHOST ?= localhost
export PGPORT ?= 15432

.PHONY: ensure-dev-db dev-postgres-create dev-postgres-build check

dev-postgres-build:
	docker build -t hs-dev-postgres -f docker/dev-postgres.Dockerfile docker

dev-postgres-create: dev-postgres-build
	docker run -d --name hspg --env=POSTGRES_PASSWORD=postgres \
		--health-cmd "pg_isready -U postgres" --health-interval 10s --health-timeout 5s --health-retries 5 \
		-p 15432:5432 hs-dev-postgres
	@printf "Waiting for Postgres container.";
	@while [ $$(docker inspect --format='{{.State.Health.Status}}' hspg) != "healthy" ]; do \
		sleep 2; \
		printf '.'; \
	done
	@echo "ready"
	@yarn run-pg-sql postgres -q -e "CREATE USER \"dbowner\" WITH PASSWORD 'onlyindev'; ALTER USER dbowner WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION;"

ensure-dev-db:
	@yarn run-pg-sql postgres -q -e 'SELECT 1' 2>/dev/null || make dev-postgres-create

check:
	yarn prettier -c src --write && yarn lint -- --fix && yarn typecheck