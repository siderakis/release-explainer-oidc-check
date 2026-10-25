import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The bug class: SKILL.md is the only thing that tells an agent where to
 * fetch a presentation from. A renamed route, a typo'd host, or a skill that
 * never reached the published collection all fail the same silent way — the
 * agent runs one curl, gets nothing usable, and improvises an answer from
 * general knowledge, which is exactly what reading the real transcript exists
 * to prevent. These assertions pin the parts that have to stay true.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const COLLECTION = path.resolve(SKILL, "../..");

const read = (p) => fs.readFileSync(path.join(COLLECTION, p), "utf8");

const WATCH_MD = read("skills/watch/SKILL.md");
const README = read("README.md");

/** Served by `getPresentationContext` (functions/bisque, FUNCTION_ROUTES). */
const ENDPOINT_PATH = "/api/presentations/context";

describe("frontmatter", () => {
  test("the name matches the directory", () => {
    const m = /^---\n([\s\S]*?)\n---/.exec(WATCH_MD);
    expect(m).not.toBeNull();
    expect(m[1]).toContain("name: watch");
  });

  // Intent-matching surface: a stranger types the word they know, and the
  // repo's vocabulary rule keeps those terms in the trigger list even though
  // our own prose never uses them.
  test("the description carries the terms people actually type", () => {
    const m = /^---\n([\s\S]*?)\n---/.exec(WATCH_MD);
    const description = m[1];
    for (const term of ["watch", "summarize", "deck", "slideshow"]) {
      expect(description).toContain(term);
    }
  });
});

describe("the endpoint the skill tells agents to call", () => {
  test("names the real route", () => {
    expect(WATCH_MD).toContain(ENDPOINT_PATH);
  });

  test("documents both target forms the endpoint accepts", () => {
    expect(WATCH_MD).toContain("url=");
    expect(WATCH_MD).toContain("handle=");
    expect(WATCH_MD).toContain("slug=");
  });

  // Signed-in is the primary path (the read gets attributed), and the
  // anonymous fallback is what makes a first install work at all. Losing
  // either half breaks a real user.
  test("sends credentials when they exist and still works without them", () => {
    expect(WATCH_MD).toContain("BISQUE_API_KEY");
    expect(WATCH_MD).toContain("~/.bisque/config.json");
    expect(WATCH_MD).toContain("Drop the header");
  });

  // The config's real field names, not plausible-looking ones. This shipped
  // wrong once: the doc said `api_key` and a `default` profile, while the
  // file on disk uses `apiKey` and resolves `present` first — an agent
  // following the doc finds nothing and fetches anonymously, silently losing
  // the attribution that is the whole point of sending a key.
  test("names the config fields that actually exist", () => {
    expect(WATCH_MD).toContain("apiKey");
    expect(WATCH_MD).not.toContain("api_key");
    expect(WATCH_MD).toContain("BISQUE_PROFILE");
    expect(WATCH_MD).toContain(".bisque.json");
  });
});

describe("grounding rules survive edits", () => {
  test("citations are slide-numbered", () => {
    expect(WATCH_MD).toContain("[slide N]");
  });

  test("a truncated transcript has to be disclosed", () => {
    expect(WATCH_MD).toContain("transcriptTruncatedSlides");
  });
});

describe("the collection lists it", () => {
  test("README names the watch skill", () => {
    expect(README).toContain("watch");
    expect(fs.existsSync(path.join(COLLECTION, "skills/watch/SKILL.md"))).toBe(
      true,
    );
  });
});
