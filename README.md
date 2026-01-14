# Bun Bug: `server.reload()` with HMR breaks bundler on second request

## Summary

When using `server.reload()` to enable HMR after an initial `Bun.serve()` in a monorepo with workspace links, the **second page load fails** with file reading errors. Using `Bun.serve()` directly with HMR works fine.

## Environment

- **Bun version**: 1.3.6
- **OS**: macOS Darwin 25.2.0

## Minimal Reproduction

```bash
git clone https://github.com/youruser/bun-bugs
cd bun-bugs
bun install
bun run dev
```

1. Open http://localhost:3000 - **works**
2. Refresh the page - **fails** with:

```
error: Unexpected reading file: "/path/to/packages/shared/index.ts"
```

## Toggle to Compare

In `packages/app/server.ts`, toggle `USE_RELOAD`:

```typescript
const USE_RELOAD = true;  // ❌ BUG: fails on second refresh
const USE_RELOAD = false; // ✅ WORKS: refreshes work fine
```

## Root Cause

The bug occurs when ALL of these conditions are met:

1. **Monorepo with workspace links** (`"workspace:*"` dependencies)
2. **Shared package imported by both server and client**
3. **`server.reload()` used to add HMR** (vs direct `Bun.serve()`)
4. **`--watch` or `--hot` flag**

## Working vs Broken

| Pattern | Result |
|---------|--------|
| `Bun.serve({ development: { hmr: true } })` | ✅ Works |
| `Bun.serve({...})` then `server.reload({ development: { hmr: true } })` | ❌ Fails |

## Use Case

This pattern is common for production deployments where the server must:
1. Bind port immediately for health checks (Fly.io, Railway, etc.)
2. Run async initialization
3. `server.reload()` to enable full routes + HMR

## Project Structure

```
bun-bugs/
├── package.json                 # workspaces: ["packages/*"]
├── packages/
│   ├── shared/                  # @repro/shared
│   │   └── index.ts             # Imported by both server & client
│   └── app/
│       ├── package.json         # depends on @repro/shared
│       ├── server.ts            # Toggle USE_RELOAD to test
│       ├── main.tsx             # Imports @repro/shared
│       └── index.html
```

## Related Issues

- #10813 - Similar symptoms with shared imports
- #17607 - Similar "Unexpected reading file" errors
- #23564 - `server.reload()` doesn't initialize dev server if not previously loaded
