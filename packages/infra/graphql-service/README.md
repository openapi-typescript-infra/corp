# @justtellme/graphql-service

A base Typescript service for hosting GraphQL services using Apollo. graphql-service is built on top of [@justtellme/service](../service) which in turn is built on open sourced [@openapi-typescript-infra/service](/@openapi-typescript-infra/service).

It's useful to read the information on those packages to understand the context, but TL;DR:

* Multilayered multienvironment configuration in JSON files.
* Dev time and production time support with same `yarn start`
* Telemetry and well structured logging

## GraphQL

Your job, fearless GraphQL designer, is to fill out the following information:

* api/\*\*.graphql - Put the schema you want to serve - types, queries and mutations in this directory. It will be glommed together, run through graphql codegen with our config and passed to the Apollo Server as "typeDefs."
* src/resolvers - Put query and mutation resolvers in this directory, in whatever structure floats your boat. All source files will be loaded, and any that export "resolvers" will be added to your resolvers and passed to Apollo Server.

But fear not, you do not have to go blindly into the hell that is SDL authoring, you have some weapons in [enhanced-gql](src/gql-plugin/enhanced-gql.ts) codegen plugin. It currently does two things:

1. If you add a prop with a @paginated directive, the plugin will automatically create the edge and connection type and modify your schema to use it (not your resolvers, that's on you).

2. If you say a type implements an interface, the plugin will copy the fields for you. Why the heck should you have to type them again, and their descriptions?

3. Input types can be automatically created from existing types using the @asinput directive

Lots more to come, including how to handle auth.
