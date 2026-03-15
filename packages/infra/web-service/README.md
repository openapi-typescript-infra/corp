# @justtellme/web-service

A base NextJS service for hosting web sites using React and GraphQL. web-service is built on top of [@justtellme/service](../service) which in turn is built on open sourced (but written here) [@openapi-typescript-infra/service](/@openapi-typescript-infra/service).

It's useful to read the information on those pcakges to understand the context, but TL;DR:

- Multilayered multienvironment configuration in JSON files.
- Dev time and production time support with same `yarn start`
- Telemetry and well structured logging
- NextJS with sensible defaults
