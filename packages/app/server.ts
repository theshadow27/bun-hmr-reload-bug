// Bug repro: server.reload() with HMR fails on second request in monorepo
//
// Toggle USE_RELOAD to test:
//   true  = BUG: second page load fails with "Unexpected reading file"
//   false = WORKS: multiple refreshes work fine

const USE_RELOAD = true; // <-- Toggle this to test

import { APP_NAME, formatMessage } from "@repro/shared";
import homepage from "./index.html";

if (USE_RELOAD) {
  // ❌ BUG: This pattern fails on second request
  console.log(formatMessage("Using reload pattern (BUG)..."));

  const server = Bun.serve({
    port: 3000,
    development: true,
    routes: {
      "/health": () => Response.json({ status: "starting" }, { status: 503 }),
    },
    fetch: () => new Response("Starting...", { status: 503 }),
  });

  console.log(formatMessage("Phase 1: Early bind complete"));

  // Simulate async init
  await Bun.sleep(100);

  console.log(formatMessage("Phase 2: Reloading with HMR..."));

  server.reload({
    development: { hmr: true, console: true },
    routes: {
      "/": homepage,
      "/health": () => Response.json({ status: "ok" }),
      "/api/info": () => Response.json({ app: APP_NAME, time: Date.now() }),
    },
    fetch: () => new Response("Not Found", { status: 404 }),
  });

  console.log(formatMessage(`Server ready at http://localhost:${server.port}`));
} else {
  // ✅ WORKS: Direct serve with HMR
  console.log(formatMessage("Using direct serve (WORKS)..."));

  const server = Bun.serve({
    port: 3000,
    development: { hmr: true, console: true },
    routes: {
      "/": homepage,
      "/health": () => Response.json({ status: "ok" }),
      "/api/info": () => Response.json({ app: APP_NAME, time: Date.now() }),
    },
    fetch: () => new Response("Not Found", { status: 404 }),
  });

  console.log(formatMessage(`Server ready at http://localhost:${server.port}`));
}

console.log("");
console.log("Test: Open http://localhost:3000, then refresh twice");
console.log(`Mode: USE_RELOAD = ${USE_RELOAD}`);
