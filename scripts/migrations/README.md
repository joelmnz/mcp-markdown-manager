# Database Migrations

This directory contains database migration scripts for schema updates.

## Migration System

The migration system tracks schema versions and applies changes incrementally. Each migration has:

- **Version number**: Sequential integer (1, 2, 3, ...)
- **Description**: Human-readable description of changes
- **Apply function**: Code to execute the migration

## Creating Migrations

1. Add a new migration object to the `migrations` array in `scripts/database.ts`
2. Increment the version number
3. Provide a clear description
4. Implement the `apply` function with the necessary SQL changes

Example:
```typescript
{
  version: 2,
  description: 'Add tags column to articles table',
  apply: async () => {
    await database.query('ALTER TABLE articles ADD COLUMN tags TEXT[] DEFAULT \'{}\'');
    await database.query('CREATE INDEX idx_articles_tags ON articles USING gin(tags)');
  }
}
```

## Running Migrations

Use the database CLI to manage migrations:

```bash
# Check current schema version and pending migrations
bun run db:migrate

# Apply all pending migrations
bun run db:migrate

# Verify schema after migration
bun run db:verify
```

## Best Practices

1. **Always backup** before running migrations in production
2. **Test migrations** on a copy of production data first
3. **Make migrations reversible** when possible
4. **Use transactions** for complex migrations
5. **Document breaking changes** clearly

## Schema Versioning

The system uses a `schema_version` table to track applied migrations:

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  description TEXT
);
```

## Rollback Strategy

Currently, rollbacks must be done manually by:

1. Restoring from backup: `bun run db:restore <backup-file>`
2. Or creating a new migration that reverses changes

Future versions may include automatic rollback capabilities.