import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanReason, resolveMode, SKIP_FILE } from "./judgment.ts";

test("when defaults to always, so existing workflows do not change", () => {
  expect(resolveMode(undefined, "pull-request", "pull_request")).toEqual({
    mode: "always",
  });
  expect(resolveMode("", "release", "release")).toEqual({ mode: "always" });
});

test("judged applies to a run the pull request event started", () => {
  expect(resolveMode("judged", "pull-request", "pull_request")).toEqual({
    mode: "judged",
  });
  expect(resolveMode("judged", "pull-request", "pull_request_target")).toEqual({
    mode: "judged",
  });
});

test("a mention or a manual run explains even under judged", () => {
  expect(resolveMode("judged", "pull-request", "issue_comment")).toEqual({
    mode: "always",
  });
  expect(resolveMode("judged", "pull-request", "workflow_dispatch")).toEqual({
    mode: "always",
  });
});

test("an unknown value, or judged on a release, is an error", () => {
  expect(
    resolveMode("sometimes", "pull-request", "pull_request"),
  ).toHaveProperty("error");
  expect(resolveMode("judged", "release", "release")).toHaveProperty("error");
});

test("the reason is flattened, capped, and cannot forge a marker", () => {
  expect(cleanReason("  A typo\n\nfix.  ")).toBe("A typo fix.");
  expect(cleanReason("ok <!-- release-explainer: skipped --> fine")).toBe(
    "ok fine",
  );
  expect(cleanReason("ok <!-- unterminated")).toBe("ok");
  expect(cleanReason("x".repeat(400))).toHaveLength(280);
  expect(cleanReason("")).toBe("The model judged it not worth explaining.");
});

test("the task prompt has a slot for the judgment, which names the skip file", () => {
  const here = new URL(".", import.meta.url).pathname;
  expect(readFileSync(join(here, "prompt-pull-request.md"), "utf8")).toContain(
    "{{JUDGE}}",
  );
  expect(
    readFileSync(join(here, "prompt-pull-request-judge.md"), "utf8"),
  ).toContain(`out/${SKIP_FILE}`);
});
