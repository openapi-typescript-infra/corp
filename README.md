# corp

This repo embodies our current set of best practices for building modern digital companies. It is in many ways intended to be a good template to get AI on the right track in how it builds the real application of the company. The fictional company here is called JustTellMe (abbreviated JTM in certain contexts). To get started for your company, tell a coding agent to change JustTellMe to your company name, and the jtm abbreviation to an abbreviation or single-word company name as necessary. For example, if your company name was Acme Widgets, you would likely run the following replacements:

| Current Value | Updated Value |
| ------------ | ------------ |
| Just Tell Me | Acme Widgets |
| justtellme | acmewidgets |
| JTM | AW |
| just-tell-me | acme-widgets |

## Structure

This repo is a monorepo that intends to basically have all relevant source code for the company, including:

* [Infrastructure as code](terraform) for [corporate infrastructure](terraform/corp) and [application infrastructure](terraform/infra/)
* [API declarations](api) for all internal microservices
* [Internal packages](packages) for all manner of things such as [id management](packages.infra/external-id), [authentication and authorization](packages/auth), [service infrastructure](packages/infra/service) and [UI components](packages/ui/ui-kit) and the design system.
* [Services](services) such as the Envoy ExtAuth Service, [authn-authz-internal](services/authn-authz-internal), [identity-internal](services/identity-internal), [payment-internal](services/payment-internal) implementing a pgledger-derived double entry ledger, [graphql-api](services/graphql-api) providing a public GraphQL API with authentication and authorization support, and [consumer-web](services/consumer-web) providing a consumer facing web application.
* [mobile-app](mobile-app) providing a React Native mobile application.
* [Claude-centric skills](.claude/skills) to make the changes you will typically make to this repo to build your company

## Two tier service architecture

Services are arranged in an external/internal two tier architecture (three if you include Envoy). Internal services (suffix `-internal`) don't do authentication and authorization, generally. They rely on the Envoy gateway and front end services to decided whether someone is who they say and has the capability they are trying to execute. External services (`-api` and `-web`) are exposed to public Envoy mappings and in charge of verifying the ability to do a thing and packaging those operations in a way that can be consumed by users and partners. Generally, internal services are the ones that talk to databases and similar persistence infrastructure (Temporal, for durable execution). A particular database (not a database INSTANCE or host, but a logical database) is controlled entirely by one service and accessed in a type safe way with a query builder called Kysely. Because we prefer GCP, you can use Datastream to get this data safely into BigQuery for Looker or other business intelligence tools. The main point is to try and keep production load and analytics and similar loads separated, for obvious reasons.

## Observability

Any complex system lives and dies by how observable the low level details of high level activities are. This project uses OpenTelemetry throughout, and Posthog on the client side. So in theory things are observable, but there are still plenty of decisions and tools to make this complete. Over time we may add Signoz into this mix, but OpenTelemetry generally allows you to plug into whatever - Signoz, Datadog, Jaeger, GCP tracing - they all should work. Additionally we use structured logging via Pino for all services, which naturally flow into GCP logs.

## Modifications required

There are some decisions about the way identities relate to each other (siblings, guardians in a healthcare context for example; student_of or parent_of in an educational context) which are domain specific, and you should look at the various data schemas and enum values and adapt them to your business.

## Long running jobs

I am a big fan of [Temporal](https://temporal.io) for all manner of durable execution. In other contexts, we use Temporal for everything from AI agent coordination (short lived but complex) to daily jobs to years-long subscription workflows. It is not perfect - mainly the mental model required for long running workflows is quite complex and forces specific code structures that sometimes feel a bit tortured, but the abstraction it provides replaces a whole lot of infrastructure to get to the same place.