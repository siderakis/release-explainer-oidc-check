import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyResponse,
  eventsFile,
  lastRefusal,
  refusalIn,
} from "./provider-refusal.ts";

test("a refused key is auth, whatever the provider says", () => {
  expect(classifyResponse(401)).toBe("auth");
  expect(classifyResponse(403)).toBe("auth");
  expect(
    classifyResponse(
      400,
      '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}',
    ),
  ).toBe("auth");
});

test("a spent plan or account is a limit", () => {
  expect(classifyResponse(429)).toBe("limit");
  expect(classifyResponse(402)).toBe("limit");
  expect(
    classifyResponse(
      400,
      "Your credit balance is too low to access the Anthropic API.",
    ),
  ).toBe("limit");
});

test("anything else is an ordinary error or a success", () => {
  expect(classifyResponse(200)).toBe("ok");
  expect(classifyResponse(400, '{"error":"bad request"}')).toBe("error");
  expect(classifyResponse(500)).toBe("error");
  expect(classifyResponse(529)).toBe("error");
});

test("only the provider's last answer decides", () => {
  expect(lastRefusal("200 ok\n401 auth\n")).toBe("auth");
  expect(lastRefusal("429 limit\n429 limit\n")).toBe("limit");
  // A rate limit the harness retried through is not why the run failed.
  expect(lastRefusal("429 limit\n200 ok\n")).toBeNull();
  expect(lastRefusal("401 auth\n500 error\n")).toBeNull();
  expect(lastRefusal("")).toBeNull();
});

test("a run with no proxy record has no refusal", () => {
  const work = mkdtempSync(join(tmpdir(), "refusal-"));
  expect(refusalIn(work)).toBeNull();
  writeFileSync(eventsFile(work), "200 ok\n429 limit\n");
  expect(refusalIn(work)).toBe("limit");
});
