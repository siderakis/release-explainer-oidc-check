import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// post-watch-link.ts runs its step on import, so the pure functions are
// loaded with the step env pointed at nothing.
process.env.SOURCE = "none";
process.env.WATCH_URL = "https://bisque.today/p/o/r/v1";
const { appendLine, watchBlock } = await import("./post-watch-link.ts");

const BLOCK = watchBlock(
  "u1",
  "rel-abc",
  "https://bisque.today/p/o/r/v1",
  "Widget 1.2",
);

test("the block is a rule, a clickable poster, and the link", () => {
  expect(BLOCK).toStartWith("---\n\n");
  expect(BLOCK).toContain(
    "[![A narrated explainer of Widget 1.2](https://bisque.today/poster/u1/rel-abc/og-slide.png)](https://bisque.today/p/o/r/v1)",
  );
  expect(BLOCK).toContain(
    "[Watch the explainer](https://bisque.today/p/o/r/v1)",
  );
});

test("without the ids it falls back to the link alone", () => {
  const b = watchBlock("", "", "https://bisque.today/p/o/r/v1");
  expect(b).toBe("---\n\n[Watch the explainer](https://bisque.today/p/o/r/v1)");
});

test("the marker sits on its own line, with the notes separated above it", () => {
  const once = appendLine(
    "## Notes\n\n- a fix\n",
    "<!-- release-explainer -->",
    BLOCK,
  );
  expect(once).toContain("- a fix\n\n<!-- release-explainer -->\n\n---\n\n");
});

test("a rerun replaces the whole previous block rather than stacking", () => {
  const once = appendLine(
    "## Notes\n\n- a fix\n",
    "<!-- release-explainer -->",
    BLOCK,
  );
  const twice = appendLine(once, "<!-- release-explainer -->", BLOCK);
  expect(twice).toBe(once);
  expect(twice.match(/og-slide\.png/g)).toHaveLength(1);
});

test("the bare line older versions wrote is cleaned up", () => {
  const old =
    "## Notes\n\nWatch the explainer: https://bisque.today/p/o/r/old\n";
  expect(appendLine(old, "<!-- release-explainer -->", BLOCK)).not.toContain(
    "/r/old",
  );
});

test("notes that merely mention the phrase survive", () => {
  expect(
    appendLine(
      "See the explainer below.\n",
      "<!-- release-explainer -->",
      BLOCK,
    ),
  ).toContain("See the explainer below.");
});

// The pull request branch runs against a stand-in `gh` that records every
// call and answers the comment listing with an empty array.
function runPullRequestStep(skipped: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "post-watch-link-"));
  const log = join(dir, "calls.log");
  writeFileSync(
    join(dir, "gh"),
    `#!/bin/sh\necho "$*" >> "${log}"\necho "[]"\n`,
  );
  chmodSync(join(dir, "gh"), 0o755);
  const run = spawnSync(
    process.execPath,
    [join(import.meta.dir, "post-watch-link.ts")],
    {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        SOURCE: "pull-request",
        REPO: "o/r",
        PR_NUMBER: "7",
        WATCH_URL: "https://bisque.today/p/o/r/v1",
        SKIPPED: String(skipped),
        SKIP_REASON: "It only bumps lodash from 4.17.20 to 4.17.21.",
      },
    },
  );
  expect(run.status).toBe(0);
  return existsSync(log) ? readFileSync(log, "utf8") : "";
}

test("a skipped pull request gets no comment, and its comments are not read", () => {
  expect(runPullRequestStep(true)).toBe("");
});

test("an explained pull request gets the watch link as a comment", () => {
  const calls = runPullRequestStep(false);
  expect(calls).toStartWith("api repos/o/r/issues/7/comments");
  expect(calls).toContain(
    "\npr comment 7 -R o/r --body <!-- release-explainer -->",
  );
  expect(calls).toContain("(https://bisque.today/p/o/r/v1)");
});
