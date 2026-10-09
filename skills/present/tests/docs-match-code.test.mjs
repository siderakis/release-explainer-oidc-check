import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The bug class: documentation claiming a flag, a range, or a behaviour the
 * code does not have.
 *
 * `--speed` was documented as "default 1.0" while the validator rejected
 * anything outside 0.7–1.2. `--profile` was documented in the paragraph about
 * `login`, which ignored it. `--align none` was the opt-out for a 1 GB download
 * and appeared in no document at all.
 *
 * None of these are catchable by running the tool — every one of them is a
 * disagreement between two files. So compare the files.
 *
 * NOTE the flag parser accepts ANY `--name`; there is no allowlist to check
 * against. "The code accepts it" is therefore vacuous, and what these assert
 * instead is that the code READS it — a documented flag nothing reads is a
 * documented no-op.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, "..");
const read = (rel) => fs.readFileSync(path.join(SKILL_DIR, rel), "utf8");

const SOURCE = read("scripts/present.mjs");
const SKILL_MD = read("SKILL.md");
// README.md lives at the collection root (opensource/presenter), two up.
const README = read("../../README.md");

/** Flags the script actually reads: `flags.name` or `flags["name"]`. */
function flagsReadByCode(source) {
  const found = new Set();
  for (const m of source.matchAll(/flags\.([a-z][a-zA-Z0-9]*)/g)) {
    found.add(m[1]);
  }
  for (const m of source.matchAll(/flags\[\s*["']([a-z][a-z0-9-]*)["']\s*\]/g)) {
    found.add(m[1]);
  }
  return found;
}

/** Flags a document tells the reader to pass. */
function flagsMentionedIn(text) {
  const found = new Set();
  for (const m of text.matchAll(/--([a-z][a-z0-9-]*)/g)) found.add(m[1]);
  return found;
}

/** The script's own help text — the contract it advertises at the terminal. */
function usageBlock(source) {
  const m = /const USAGE = `([\s\S]*?)`;/.exec(source);
  if (!m) throw new Error("USAGE block not found in present.mjs");
  return m[1];
}

const READ_BY_CODE = flagsReadByCode(SOURCE);
const USAGE = usageBlock(SOURCE);
const IN_USAGE = flagsMentionedIn(USAGE);

/** Flags that are real but belong to another tool, so the skill documents them
 *  without reading them itself. Each needs a reason to be here. */
const NOT_OURS = new Set([
  "json", // `bisque-voice engines --json`, a different binary
  "text", // `bisque-voice --text …`
  "out", // `bisque-voice --out …`
  "ref-wav", // `bisque-voice clone …`
  "speaker", // `bisque-voice` speaker selection
  "scope", // `gemini skills install --scope user`
  "force", // copybara / CI, mentioned in prose
]);

describe("every flag the docs mention is one the code reads", () => {
  test.each([
    ["SKILL.md", SKILL_MD],
    ["README.md", README],
  ])("%s documents no flag the script ignores", (_name, text) => {
    const undocumentedNoops = [...flagsMentionedIn(text)].filter(
      (flag) => !READ_BY_CODE.has(flag) && !NOT_OURS.has(flag),
    );
    expect(undocumentedNoops).toEqual([]);
  });
});

describe("every flag the code reads is advertised in USAGE", () => {
  test("no flag is implemented but undiscoverable", () => {
    const missing = [...READ_BY_CODE].filter((flag) => !IN_USAGE.has(flag));
    expect(missing).toEqual([]);
  });
});

describe("documented ranges equal the validator's bounds", () => {
  test("--speed's documented range is the range the code enforces", () => {
    // The validator is the source of truth; the docs must quote it exactly.
    const guard = /speed\s*<\s*([\d.]+)\s*\|\|\s*speed\s*>\s*([\d.]+)/.exec(
      SOURCE,
    );
    expect(guard).not.toBeNull();
    const [, low, high] = guard;

    // SKILL.md is what an agent reads before choosing a value.
    expect(SKILL_MD).toContain(`${low}–${high}`);
  });

  test("the range appears in the error message a user actually sees", () => {
    const guard = /speed\s*<\s*([\d.]+)\s*\|\|\s*speed\s*>\s*([\d.]+)/.exec(
      SOURCE,
    );
    const [, low, high] = guard;
    expect(SOURCE).toContain(`between ${low} and ${high}`);
  });
});

describe("every subcommand in USAGE dispatches", () => {
  test("no advertised command falls through to the usage banner", () => {
    const advertised = [...USAGE.matchAll(/present\.mjs (\S+)/g)].map(
      (m) => m[1],
    );
    expect(advertised.length).toBeGreaterThan(0);
    for (const command of advertised) {
      expect(SOURCE).toContain(`case "${command}":`);
    }
  });
});
