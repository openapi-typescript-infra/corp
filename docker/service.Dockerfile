# This is a multistage build that results in a distroless container that runs the application
# and has busybox on it for some runtime pleasantries (I know this is a bit against distroless)
#
# Build context is the service directory. Pass a named build context for the monorepo root:
# docker build --build-context monorepo=../.. -f ../../docker/service.Dockerfile .

# --------------> For some extra tooling
FROM busybox:1.37.0-uclibc AS busybox

# --------------> The build image
FROM node:24-bookworm AS build
ARG GOOGLE_PACKAGES_TOKEN
ARG BUILD_NODE_ENV=production
ARG BUILD_VERSION=0.0.0
WORKDIR /nodejs/monorepo

# Copy monorepo root files for yarn workspace resolution
COPY --from=monorepo package.json yarn.lock .yarnrc.yml /nodejs/monorepo/
COPY --from=monorepo .yarn /nodejs/monorepo/.yarn
# Workspace packages must already be built (e.g. via turbo build) before docker build
COPY --from=monorepo packages/ /nodejs/monorepo/packages/

# Service files are nested under the monorepo so yarn can discover the root config
COPY package.json cpconfig.* /nodejs/monorepo/services/current/
# If you have files that need to be there for config phase in the container,
# (e.g. cpconfig), then they need to be in src/config
COPY src/config /nodejs/monorepo/services/current/src/config/
COPY --from=busybox /bin/busybox /staging/busybox

# Setup busybox for distroless. It's a bit against the spirit of distroless, but it's how we choose to roll
RUN ln -sr /staging/busybox /staging/sh && \
    ln -sr /staging/busybox /staging/chown && \
    ln -sr /staging/busybox /staging/cp && \
    ln -sr /staging/busybox /staging/env && \
    ln -sr /staging/busybox /staging/find && \
    ln -sr /staging/busybox /staging/grep && \
    ln -sr /staging/busybox /staging/kill && \
    ln -sr /staging/busybox /staging/ls && \
    ln -sr /staging/busybox /staging/more && \
    ln -sr /staging/busybox /staging/ping && \
    ln -sr /staging/busybox /staging/ps && \
    ln -sr /staging/busybox /staging/sleep && \
    ln -sr /staging/busybox /staging/tar && \
    ln -sr /staging/busybox /staging/telnet && \
    ln -sr /staging/busybox /staging/vi && \
    ln -sr /staging/busybox /staging/wget

# Run our custom yarn setup from the service workspace
WORKDIR /nodejs/monorepo/services/current
ENV NODE_ENV=$BUILD_NODE_ENV
RUN npm run prepack --if-present \
    && (yarn plugin remove @yarnpkg/plugin-gcp-auth || true) \
    && yarn config set npmScopes.justtellme.npmRegistryServer "https://us-central1-npm.pkg.dev/justtellme-dev/npm-packages/" \
    && yarn config set npmScopes.justtellme.npmAlwaysAuth true \
    && yarn config set npmScopes.justtellme.npmAuthToken "$GOOGLE_PACKAGES_TOKEN" > /dev/null 2>&1 \
    && if [ -f .env ]; then set -a; . ./.env; set +a; fi \
    && yarn config set nmMode classic \
    && node -e "const fs=require('fs'),g=require('path');['/nodejs/monorepo/packages','/nodejs/monorepo/services'].forEach(function(d){(function r(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=g.join(p,e.name);if(e.isDirectory())r(f);else if(e.name==='package.json'){const j=JSON.parse(fs.readFileSync(f));if(j.scripts){delete j.scripts.postinstall;delete j.scripts.preinstall;delete j.scripts.install}fs.writeFileSync(f,JSON.stringify(j,null,2))}}})(d)})" \
    && yarn workspaces focus --production \
    && npm run postinstall --if-present \
    && npm run postpack --if-present \
    && rm -rf /nodejs/monorepo/.yarnrc.yml /nodejs/monorepo/.yarn \
    && cp -rL /nodejs/monorepo/node_modules /nodejs/resolved_node_modules \
    && rm -rf /nodejs/monorepo/node_modules \
    && mv /nodejs/resolved_node_modules /nodejs/monorepo/node_modules \
    && rm -rf /nodejs/monorepo/node_modules/@types \
    && find /nodejs/monorepo/node_modules/@opentelemetry -name '*.js.map' -delete \
    && printf '#!/bin/sh\n/nodejs/bin/node node_modules/@openapi-typescript-infra/service/build/bin/start-service.js --built "$@"' > /staging/start \
    && printf '#!/bin/sh\n/nodejs/bin/node node_modules/@openapi-typescript-infra/service/build/bin/start-service.js --repl "$@"' > /staging/repl \
    && chmod a+rx /staging/start /staging/repl

# Stamp the service package version. Separated from the dep-install RUN
# above so version bumps don't bust that layer's cache.
#
# Plain `fs.writeFileSync` rather than `npm version`, which chokes on
# yarn's `workspace:^` protocol used by in-repo deps:
#   npm error code EUNSUPPORTEDPROTOCOL
#   npm error Unsupported URL Type "workspace:": workspace:^
# The previous `|| true` masked the failure so the stamp silently no-op'd.
RUN node -e "const fs=require('node:fs');const p=process.argv[1];const pkg=JSON.parse(fs.readFileSync(p,'utf8'));pkg.version=process.argv[2];fs.writeFileSync(p,JSON.stringify(pkg,null,2)+'\n');" package.json "$BUILD_VERSION"

## --------------> Add to default image
FROM gcr.io/distroless/nodejs24-debian13:latest AS base
COPY --from=build --chown=nonroot:nonroot /staging/ /bin/
RUN /bin/busybox mkdir -p /nodejs/app && \
    /bin/busybox chown nonroot:nonroot /nodejs/app

## --------------> Build the pipeline directory
FROM base AS final
USER nonroot
WORKDIR /nodejs/app
COPY --chown=nonroot:nonroot --from=build /nodejs/monorepo/node_modules /nodejs/app/node_modules
COPY --chown=nonroot:nonroot --from=build /nodejs/monorepo/services/current/package.json /nodejs/app/package.json
COPY --chown=nonroot:nonroot README.md next.config.* cpconfig.* sentry.*.config.* /nodejs/app/
COPY --chown=nonroot:nonroot src/ /nodejs/app/src/
COPY --chown=nonroot:nonroot config/ /nodejs/app/config/
COPY --chown=nonroot:nonroot migrations/ /nodejs/app/migrations/
COPY --chown=nonroot:nonroot api/ /nodejs/app/api/
COPY --chown=nonroot:nonroot public/ /nodejs/app/public/
COPY --chown=nonroot:nonroot private/ /nodejs/app/private/

## --------------> Flatten where possible
FROM base
USER nonroot
ENV NODE_ENV=production
ENV NODE_NO_WARNINGS=1
ENV NO_PRETTY_LOGS=1
ENV NODE_OPTIONS=--conditions=production
WORKDIR /nodejs/app
CMD ["node_modules/@openapi-typescript-infra/service/build/bin/start-service.js"]
COPY --from=final --chown=nonroot:nonroot /nodejs/app /nodejs/app

HEALTHCHECK --interval=5m --timeout=3s \
  CMD /nodejs/bin/node -e 'require("http").get("http://localhost:3000", res => process.exit(res.statusCode === 200 ? 0 : 1)).on("error", err => process.exit(1))'
