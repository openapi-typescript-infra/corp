# web-auth

Authentication and authorization services for Just Tell Me services (typically web projects, but factored out so that it can be used in API projects as well if desired).

This module also handles session middleware, just for convenience. It is included in @justtellme/service-with-auth but NOT in @justtellme/service.

## Authorization

This module provides an OpenAPI security validation implementation that uses Filtrex style rules to specify authorization mechanics.

The rules execute in a context that includes the request query and path parameters as well as the user object as well as some convenience functions and methods on these objects. For example to make sure that a providerId matches a path parameter:

`user.id == params.consumer_id`

You can also create utility functions that provide cleaner rules:

`hasAccess(user, params.other_user_id)`

Which would rely on a function with the signature:

```typescript
async function hasAccess(user: AuthPrincipal, otherId: string) {
  // Check stuff
  const result = await someBooleanFn(req);
  return result;
}
```

You don't have to locate all your rules in your API specs, you can also just make them middleware:

```typescript
router.get('/something', withAuthorization('hasAccess(user, params.other_user_id)'), (req, res) => {
  // Your normal handler here, which won't get called if they don't have permission.
});
```

To enable OpenAPI validation, you need to define the security handlers:

```yaml
components:
  securitySchemes:
    justtellme:
      # This is fake. But it is what will get express-openapi-validator to leave the request alone.
      # Issue filed: https://github.com/cdimascio/express-openapi-validator/issues/731
      type: openIdConnect
      openIdConnectUrl: https://auth.justtellme.com/.well-known/openid-configuration
```