/**
 * Test cases to differentiate our bug from linked issues:
 * - #25551: Bun.build() stale fd on second call
 * - #11123: Bun.build() + --hot fails
 * - #23564: server.reload() doesn't init HMR if no initial HTML route
 * - OURS: server.reload() + HMR + workspace packages fails on second request
 *
 * Run: bun test test-issues.test.ts
 */

import { test, expect, describe, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { join } from "path";

// --- Test Helpers ---

interface ServerProcess {
  proc: Subprocess;
  port: number;
  kill: () => void;
  getStderr: () => Promise<string>;
}

async function startServer(script: string, flags: string[] = [], port = 3000): Promise<ServerProcess> {
  const proc = spawn({
    cmd: ["bun", "run", ...flags, script],
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server to be ready
  const start = Date.now();
  while (Date.now() - start < 10000) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) break;
    } catch {}
    await Bun.sleep(100);
  }

  return {
    proc,
    port,
    kill: () => proc.kill(),
    getStderr: async () => {
      const reader = proc.stderr.getReader();
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } catch {}
      return new TextDecoder().decode(Buffer.concat(chunks));
    },
  };
}

async function fetchHTML(port: number): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(`http://localhost:${port}/`);
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

// --- Tests ---

describe("Issue #25551 - Explicit Bun.build() API", () => {
  test("Bun.build() called twice on same file works", async () => {
    const file = join(import.meta.dir, "packages/shared/index.ts");

    const r1 = await Bun.build({ entrypoints: [file] });
    const r2 = await Bun.build({ entrypoints: [file] });

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    console.log("  #25551 scenario: PASSED (not reproduced)");
  });
});

describe("Issue #23564 - server.reload() HMR init", () => {
  let server: ReturnType<typeof Bun.serve> | null = null;

  afterAll(() => server?.stop());

  test("reload can add HMR route after initial serve", async () => {
    server = Bun.serve({
      port: 4001,
      routes: { "/health": () => Response.json({ ok: true }) },
      fetch: () => new Response("Not found", { status: 404 }),
    });

    const html = await import("./packages/app/index.html");
    server.reload({
      development: { hmr: true },
      routes: { "/health": () => Response.json({ ok: true }), "/": html.default },
      fetch: () => new Response("Not found", { status: 404 }),
    });

    const res = await fetchHTML(4001);
    expect(res.body).toContain("<!DOCTYPE html>");
    console.log("  #23564 scenario: PASSED (HMR route works via reload)");
  });
});

describe("OUR BUG - server.reload() + HMR + workspace + --watch", () => {
  let server: ServerProcess | null = null;

  afterAll(() => server?.kill());

  test("second request fails with workspace imports under --watch", async () => {
    server = await startServer("packages/app/server.ts", ["--watch"]);
    console.log("  Server started with --watch");

    const r1 = await fetchHTML(server.port);
    const r2 = await fetchHTML(server.port);
    const r3 = await fetchHTML(server.port);

    console.log(`  Request 1: ${r1.ok ? "OK" : "FAIL"} (${r1.status})`);
    console.log(`  Request 2: ${r2.ok ? "OK" : "FAIL"} (${r2.status})`);
    console.log(`  Request 3: ${r3.ok ? "OK" : "FAIL"} (${r3.status})`);

    // Our bug: first works, subsequent fail
    if (r1.ok && !r2.ok) {
      console.log("  -> BUG REPRODUCED: first request OK, second fails");
    }

    // Test passes either way - we're documenting behavior
    expect(r1.ok).toBe(true);
  }, 30000);
});

describe("CONTROL - Direct serve with HMR + workspace", () => {
  let server: ReturnType<typeof Bun.serve> | null = null;

  afterAll(() => server?.stop());

  test("multiple requests work without reload pattern", async () => {
    const { APP_NAME } = await import("./packages/shared/index.ts");
    const html = await import("./packages/app/index.html");

    server = Bun.serve({
      port: 4002,
      development: { hmr: true },
      routes: {
        "/health": () => Response.json({ ok: true }),
        "/": html.default,
        "/api": () => Response.json({ app: APP_NAME }),
      },
      fetch: () => new Response("Not found", { status: 404 }),
    });

    const r1 = await fetchHTML(4002);
    const r2 = await fetchHTML(4002);
    const r3 = await fetchHTML(4002);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    console.log("  Direct serve: all 3 requests PASSED");
  });
});
