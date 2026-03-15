# cloud-sql

A (currently) simple set of helpers for connection to Google CloudSQL Postgres databases. In K8S, we use [Google's Connector](https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector) to connect to these databases, but locally we connect with plain credentials. This module helps abstract away that difference to configuration.

The module also assists with read-only replica configuration, providing a simple setting to enable an R/O replica, and always providing a pool in that "slot" so that your consuming code doesn't have to worry about whether there
really is an R/O replica or not. See short-url-internal for an example usage.

## TableCache

This module also provides a table cache for simpler handling of fact tables like item types or identifier types - tables that are "forward only" and relatively small, e.g. less than 1k rows. Given a table like so:

```sql
CREATE TABLE item_types (
  item_type_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
)
```

You can create a cache like so:

```typescript
// Typically comes from kysely
interface ItemType {
  item_type_id: number;
  name: string;
  created_at: Date;
}

// Unfortunately I couldn't find a way to avoid the explicit key names in the type AND the option arguments.
const itemTypeCache = createTableCache<ItemType, 'item_type_id', 'name'>(db.pool, {
  tableName: 'item_types',
  idColumn: 'item_type_id',
  nameColumn: 'name',
});
```

Now, in your application code you may have a list of one or the other and you can resolve them efficiently:

```typescript
const itemsWithTypeNames = [{ name: 'foobar' }, { name: 'baz' }];
const itemTypes = await itemTypeCache.resolveIds(itemsWithTypeNames);
// Now you can insert into some downstream table without a painful join, and in MOST cases it will only be one query since the cache will be full.
```
