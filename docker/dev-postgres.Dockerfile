FROM sibedge/postgres-plv8:18beta3-3.2.4

USER root

RUN apk add --no-cache postgis

USER postgres
