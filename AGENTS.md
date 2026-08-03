# Repository Agent Rules

## Authentication Boundary: `x-auth-token`

`x-auth-token` is a trusted, internal-only header. It is created by `authn-authz-internal` during the Envoy ExtAuth exchange and passed by Envoy to backend services.

- Clients must never create, set, copy, persist, or send `x-auth-token`.
- Public clients authenticate with the supported public credential, normally `Authorization: Bearer <session JWT>` or an approved public session cookie.
- Public API handlers must run the standard authentication middleware and use the authenticated request principal (`req.user` or the framework-equivalent context). They must not read or decode `x-auth-token` to authenticate their own request.
- `getForwardHeaders()` exists only to forward an already-authenticated identity from a public service to a downstream internal service. It is not an authentication API and must never be used as the source of the current handler's principal.
- Internal datasource/service infrastructure may propagate the trusted header after authentication. Tests may synthesize it only when explicitly testing an internal boundary.
