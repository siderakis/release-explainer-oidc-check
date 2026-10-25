import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const events = join(mkdtempSync(join(tmpdir(), "key-proxy-")), "events");

let upstream: Server;
let upstreamPort = 0;
let proxy: ReturnType<typeof Bun.spawn>;
let proxyPort = 0;
let seen: {
  url: string;
  headers: Record<string, string | string[] | undefined>;
} | null = null;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    seen = { url: req.url ?? "", headers: req.headers };
    if (req.url?.endsWith("/spent")) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
  upstreamPort = (upstream.address() as { port: number }).port;

  // The key arrives over stdin, as proxy-start.sh sends it, so it is in no
  // process environment.
  proxy = Bun.spawn(
    [
      "node",
      join(import.meta.dir, "key-proxy-server.ts"),
      `http://127.0.0.1:${upstreamPort}/v1`,
      "authorization",
      "-",
      "Bearer ",
    ],
    {
      env: { PATH: process.env.PATH ?? "", KEY_PROXY_EVENTS: events },
      stdin: new Blob(["real-secret\n"]),
      stdout: "pipe",
    },
  );
  const reader = proxy.stdout.getReader();
  const { value } = await reader.read();
  proxyPort = Number(new TextDecoder().decode(value).trim());
});

afterAll(() => {
  proxy.kill();
  upstream.close();
});

test("injects the real key and strips whatever the client sent", async () => {
  const r = await fetch(
    `http://127.0.0.1:${proxyPort}/chat/completions?key=client-placeholder&x=1`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer placeholder",
        "x-api-key": "placeholder",
        "content-type": "application/json",
      },
      body: '{"hi":1}',
    },
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
  expect(seen?.url).toBe("/v1/chat/completions?x=1");
  expect(seen?.headers.authorization).toBe("Bearer real-secret");
  expect(seen?.headers["x-api-key"]).toBeUndefined();
});

test("records each response's kind, passing the error body through", async () => {
  const r = await fetch(`http://127.0.0.1:${proxyPort}/messages/spent`, {
    method: "POST",
    body: "{}",
  });
  expect(r.status).toBe(400);
  expect(await r.text()).toContain("credit balance is too low");
  const lines = readFileSync(events, "utf8").trim().split("\n");
  expect(lines.at(-1)).toBe("400 limit");
  expect(lines).toContain("200 ok");
  // The key never lands in the file.
  expect(readFileSync(events, "utf8")).not.toContain("real-secret");
});

test("refuses to start with an empty key", () => {
  const p = Bun.spawnSync(
    [
      "node",
      join(import.meta.dir, "key-proxy-server.ts"),
      "http://127.0.0.1:1",
      "x-api-key",
      "-",
    ],
    {
      env: { PATH: process.env.PATH ?? "" },
      stdin: new Blob([""]),
    },
  );
  expect(p.exitCode).toBe(2);
});
