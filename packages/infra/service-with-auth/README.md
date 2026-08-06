# @justtellme/service-with-auth

An API service capable of doing Just Tell Me authentication (either directly or behind Envoy auth via authn-authz-internal).

## Authentication boundary

`x-auth-token` is an internal-only header created by `authn-authz-internal` during Envoy's ExtAuth exchange. Clients must never create, persist, or send it.

Public clients authenticate with the supported public credential, normally `Authorization: Bearer <session JWT>` or an approved session cookie. Public handlers must run the standard authentication middleware and use `req.user`; they must not decode `x-auth-token` themselves.

`getForwardHeaders()` may propagate the already-authenticated identity to another internal service. It is not an authentication API for the current request.
