---
name: DB package build requirement
description: @workspace/db uses TypeScript project references — dist/ must be rebuilt when schema changes
---

The `@workspace/db` package uses `"composite": true` and `"emitDeclarationOnly": true` in tsconfig, with exports pointing to `./src/index.ts`. Downstream consumers (api-server) reference it via `"references"` in their tsconfig, meaning TypeScript reads from `dist/*.d.ts`.

**Rule:** After adding new schema files to `lib/db/src/schema/`, run:
```
cd lib/db && npx tsc --build
```
before running typecheck on api-server, or the new exports won't be found.

**Why:** The package has no `build` script in package.json, so `pnpm --filter @workspace/db run build` fails. Use `npx tsc --build` directly.

**How to apply:** Any time you add new tables or schema files to lib/db, rebuild before typechecking dependent packages.
