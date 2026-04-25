# external-id

Just Tell Me uses UUIDs all over the place. In an attempt to improve utility, we are moving to prefixed short UUIDs such that a human could get a little information from seeing one - namely what kind of UUID it is. This package will centralize the "registry" of prefixes and the logic to convert to and from ExternalID to UUID.

## Usage

```typescript
import { toExternalID, fromExternalID, parseExternalID, ExternalIDType } from '@justtellme/external-id';

const short = toExternalID(ExternalIDType.User, '465AF0C6-C6ED-4108-BED9-2657A66D27C9');
// u_9FTD7DsHnnmMx8Ps3dSAjv

const long = fromExternalID('u_9FTD7DsHnnmMx8Ps3dSAjv');
// 465AF0C6-C6ED-4108-BED9-2657A66D27C9

const { type } = parseExternalID('u_9FTD7DsHnnmMx8Ps3dSAjv');
// 'u' aka ExternalIDType.User
```

## Guidance

External IDs are useful when the meaning of the identifier is not clear from its context.

| Situation | Type | Examples |
| -- | -- | -- |
| Databases | Raw UUID | individual_uuid in identity db and many others |
| Partners | External ID | Stripe, Photon, Plaid |
| URLs | Either | Depends on particulars, because sometimes the type is very clear, but even then it's useful to have a more compact id and can have benefits to see the type clearly. |

For constrained environments, use `@openapi-typescript-infra/external-id/expander` for a
0-dependency Javascript function to decode ExternalIDs.

Additionally, here is an implementation for PostgreSQL:

```pgsql
CREATE OR REPLACE FUNCTION expand_short_uuid(short_uuid TEXT) RETURNS TEXT AS $$
DECLARE
    flickrBase58 CHAR(58) := '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    decimal_value BIGINT := 0;
    hex_value TEXT;
    expanded_uuid TEXT;
    i INT;
    power INT;
    char_index INT;
BEGIN
    -- Convert base58 to decimal
    FOR i IN 1..LENGTH(short_uuid) LOOP
        char_index := POSITION(SUBSTRING(short_uuid FROM i FOR 1) IN flickrBase58) - 1;
        IF char_index = -1 THEN
            RAISE EXCEPTION 'Invalid character in input';
        END IF;
        power := LENGTH(short_uuid) - i;
        decimal_value := decimal_value + char_index * (58 ^ power);
    END LOOP;

    -- Convert decimal to hexadecimal
    hex_value := LOWER(LPAD(TO_HEX(decimal_value), 32, '0'));

    -- Format as UUID
    expanded_uuid := CONCAT(
        SUBSTRING(hex_value FROM 1 FOR 8), '-',
        SUBSTRING(hex_value FROM 9 FOR 4), '-',
        SUBSTRING(hex_value FROM 13 FOR 4), '-',
        SUBSTRING(hex_value FROM 17 FOR 4), '-',
        SUBSTRING(hex_value FROM 21 FOR 12)
    );

    RETURN expanded_uuid;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```
