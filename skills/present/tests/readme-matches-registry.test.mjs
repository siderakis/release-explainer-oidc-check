import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The bug class: public prose stating facts that live in another package's
 * source, and drifting from it.
 *
 * The README claimed "Intel Macs get the voice-clone engine only". The registry
 * says the opposite — Kokoro is the one engine Intel cannot run, and all four
 * Studio engines work there. It also called the forced aligner optional when
 * every Studio engine declares one as a companion.
 *
 * The README stopped quoting download sizes on 2026-09-07: the landing page
 * sells, and the agent names every download and its size before starting it.
 * The platform facts moved to the docs page at bisque.today/docs/present. So
 * the checks are: the README quotes no size that could drift, and the docs
 * page agrees with the registry.
 *
 * A reviewer catches this only by reading two files side by side. So do that
 * here, every run.
 *
 * These tests read a sibling package deliberately. They never publish — the
 * mirror's allowlist names `SKILL.md`, `README.md`, `CONTRIBUTING.md`,
 * `LICENSE`, and the `scripts/`, `reference/` and `.claude-plugin/`
 * directories, so this directory is excluded by construction rather than by a
 * rule someone has to remember.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, "..");
// SKILL_DIR is opensource/presenter/skills/present. The collection root (which
// holds README.md) is two up; the monorepo root (apps/bisque-voice) is four up.
const COLLECTION = path.resolve(SKILL_DIR, "../..");
const REPO = path.resolve(SKILL_DIR, "../../../..");

const README = fs.readFileSync(path.join(COLLECTION, "README.md"), "utf8");
const DOCS = fs.readFileSync(
  path.join(REPO, "docs/presenter-skill-docs/present.md"),
  "utf8",
);
const ENGINE_RS = fs.readFileSync(
  path.join(REPO, "apps/bisque-voice/src/engine.rs"),
  "utf8",
);
const ALIGN_RS = fs.readFileSync(
  path.join(REPO, "apps/bisque-voice/src/align.rs"),
  "utf8",
);

/** Every engine the registry ships, with the size it declares. */
function engineRegistry(source) {
  const engines = [];
  const re =
    /id:\s*"([a-z0-9-]+)"[\s\S]{0,900}?download_bytes:\s*([\d_]+)[\s\S]{0,600}?unsupported:\s*(\w+)/g;
  for (const m of source.matchAll(re)) {
    engines.push({
      id: m[1],
      bytes: Number(m[2].replace(/_/g, "")),
      unsupported: m[3] !== "None",
    });
  }
  return engines;
}

/** Decimal GB/MB, the way the registry's own summaries write sizes. */
function human(bytes) {
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(2).replace(/0$/, "")} GB`
    : `${Math.round(bytes / 1_000_000)} MB`;
}

const ENGINES = engineRegistry(ENGINE_RS);

describe("the registry is readable at all", () => {
  test("five engines are found, or the parser above is stale", () => {
    expect(ENGINES.map((e) => e.id).sort()).toEqual([
      "kokoro",
      "qwen3-clone-06b",
      "qwen3-clone-17b",
      "qwen3-voices-06b",
      "qwen3-voices-17b",
    ]);
  });
});

describe("the README quotes no download size", () => {
  // A size in the README is a number that drifts the day the registry changes.
  // The agent names each download and its size before starting it, so the
  // README has nothing to add and no number to get wrong.
  test.each(ENGINES.map((e) => [e.id, e]))(
    "%s's size is not in the README",
    (_id, engine) => {
      expect(README).not.toContain(human(engine.bytes));
    },
  );

  test("the aligner's size is not in the README either", () => {
    const m = /QWEN3_Q4[\s\S]*?download_bytes:\s*([\d_]+)/.exec(ALIGN_RS);
    expect(m).not.toBeNull();
    expect(README).not.toContain(human(Number(m[1].replace(/_/g, ""))));
  });
});

describe("README platform claims equal the registry's support matrix", () => {
  test("exactly one engine is unsupported on the Intel build", () => {
    // If this changes, the README's Intel paragraph is wrong by definition.
    const unsupported = ENGINES.filter((e) => e.unsupported).map((e) => e.id);
    expect(unsupported).toEqual(["kokoro"]);
  });

  test("the four Studio engines are supported everywhere", () => {
    const studio = ENGINES.filter((e) => e.id.startsWith("qwen3-"));
    expect(studio).toHaveLength(4);
    for (const engine of studio) expect(engine.unsupported).toBe(false);
  });

  test("both aligners are unsupported on the same build Kokoro is", () => {
    // The README says Intel Macs lose the small voice AND alignment. Both
    // facts come from one `cfg`, so assert the aligners really carry it.
    expect(ALIGN_RS).toContain("ALIGNER_UNSUPPORTED");
    const unsupportedCount = [
      ...ALIGN_RS.matchAll(/unsupported:\s*ALIGNER_UNSUPPORTED/g),
    ].length;
    expect(unsupportedCount).toBe(2);
  });

  test("neither the README nor the docs page claims Intel is limited to cloning", () => {
    // The exact false claim that shipped. Cheap, specific, and it stays wrong
    // forever if nobody asserts it.
    expect(README).not.toMatch(/Intel Macs get the voice-clone engine only/i);
    expect(DOCS).not.toMatch(/Intel Macs get the voice-clone engine only/i);
  });

  test("the docs page states what Intel loses: the small voice and alignment", () => {
    expect(DOCS).toMatch(/Intel Macs/);
    expect(DOCS).toMatch(/small, fast voice/);
    expect(DOCS).toMatch(/aligner/);
  });
});

describe("every Studio engine declares a companion aligner", () => {
  test("so 'optional aligner' is never true for them again", () => {
    const companions = [
      ...ENGINE_RS.matchAll(/companion_aligner:\s*Some\("([a-z0-9-]+)"\)/g),
    ].map((m) => m[1]);
    expect(companions).toHaveLength(4);
    expect(new Set(companions).size).toBe(1); // one shared pack, not four
  });
});
