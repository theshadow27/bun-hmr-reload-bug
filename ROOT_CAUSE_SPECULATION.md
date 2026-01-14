# Root Cause Speculation

This is speculative analysis based on a quick code review of the Bun source. It may or may not be accurate.

---

## 1. How `server.reload()` Works

**File:** `src/bun.js/api/server.zig` (lines 1119-1142)

The `onReload()` function:
1. Parses a new configuration object via `ServerConfig.fromJS()`
2. Calls `onReloadFromZig()` which:
   - Clears existing routes with `this.app.?.clearRoutes()`
   - Updates fetch/error handlers
   - Swaps static routes lists
   - Clears dev_server HTML router if it exists
   - Rebuilds routes

**Potentially relevant:** Line 1129-1132 - When calling `ServerConfig.fromJS()` during reload:
```zig
try ServerConfig.fromJS(globalThis, &new_config, &args_slice, .{
    .allow_bake_config = false,  // <-- May be relevant
    .is_fetch_required = true,
    .has_user_routes = this.user_routes.items.len > 0,
});
```

The `allow_bake_config = false` flag may prevent HMR bake configuration from being properly initialized on reload.

---

## 2. HMR Initialization Differences

**File:** `src/bun.js/api/server/ServerConfig.zig` (lines 667-717)

When `Bun.serve()` is called directly:
- Line 820: `if (opts.allow_bake_config)` checks the flag
- Lines 667-717: If HTML bundles or framework routers exist AND HMR is enabled, it:
  1. Creates a resolver using `&global.bunVM().transpiler.resolver` (line 674)
  2. Initializes Framework with the resolver (line 672-676)
  3. Sets up `args.bake` with proper bundler options

When `server.reload()` is called:
- `allow_bake_config = false` means this entire block is skipped (line 820)
- No new DevServer initialization happens
- The existing dev_server from the first Bun.serve() is still attached to the server

This may cause a mismatch: The dev_server exists but its resolver/transpiler context may be stale or inconsistent.

---

## 3. DevServer Lifecycle & Resolver Context

**Files:**
- `src/bake/DevServer.zig` (lines 287-427)
- `src/bun.js/api/server.zig` (lines 1640-1660)

When a DevServer is initialized:
1. **Lines 395-407:** Framework calls `initTranspiler()` which creates `server_transpiler` and `client_transpiler`
2. **Lines 409-410:** The resolver watchers are attached:
   ```zig
   dev.server_transpiler.resolver.watcher = dev.bun_watcher.getResolveWatcher();
   dev.client_transpiler.resolver.watcher = dev.bun_watcher.getResolveWatcher();
   ```
3. **Line 422:** The framework is resolved with the transpiler resolvers:
   ```zig
   dev.framework = dev.framework.resolve(&dev.server_transpiler.resolver,
                                          &dev.client_transpiler.resolver,
                                          options.arena) catch {...};
   ```

**Hypothesis:** In server.reload():
- The dev_server already exists from the initial `Bun.serve()`
- Its resolver context is bound to the first transpiler's resolver (from initial serve)
- When reload happens with HTML bundles that use monorepo workspace symlinks, the resolver may not be properly reset or re-bound
- The resolver tries to read workspace-linked packages using the old context

---

## 4. Workspace Symlink Resolution

**Files:**
- `src/resolver/resolver.zig`
- `src/bun.js/api/server.zig` (line 1051-1054)

When `server.reload()` is called on a monorepo:

1. **onReloadFromZig()** clears the dev_server's HTML router (lines 1051-1054):
   ```zig
   if (this.dev_server) |dev_server| {
       dev_server.html_router.clear();
       dev_server.html_router.fallback = null;
   }
   ```

2. It does NOT appear to:
   - Reinitialize the resolver with the new transpiler context
   - Clear the resolver's cache of workspace resolutions
   - Rebind the dev_server to use an updated resolver

3. Workspace packages (using `"workspace:*"` in package.json) are resolved as symlinks rather than actual node_modules, which may be more sensitive to resolver context issues.

---

## 5. Key Code Locations

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| server.reload() | `src/bun.js/api/server.zig` | 1119-1142 | Entry point for reload |
| onReloadFromZig() | `src/bun.js/api/server.zig` | 1019-1099 | Applies reload |
| ServerConfig.fromJS() | `src/bun.js/api/server/ServerConfig.zig` | 383-912 | Parses config |
| HMR bake setup | `src/bun.js/api/server/ServerConfig.zig` | 667-717 | Only runs when `allow_bake_config = true` |
| DevServer.init() | `src/bake/DevServer.zig` | 287-427 | Creates resolver, transpilers, watchers |
| Resolver setup | `src/bake/DevServer.zig` | 409-422 | Binds resolver watchers to transpilers |

---

## 6. Summary

The `allow_bake_config = false` flag in `server.reload()` may prevent proper HMR/bundler reinitialization, leaving the DevServer with a stale resolver context that fails to handle workspace symlinks correctly on subsequent requests.

This is speculation and requires verification from the Bun team.
