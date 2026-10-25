import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The bug class: the collection's README, the video SKILL.md and the present
 * SKILL.md drifting apart about what the video skill is and where it lives.
 *
 * The `video` skill shipped inside the monorepo a full release before it
 * reached the public repo, so `present`'s SKILL.md told agents to hand off to a
 * skill the public collection did not contain. Nothing failed — the agent
 * simply could not find it. These assertions are what would have caught it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const COLLECTION = path.resolve(SKILL, "../..");

const read = (p) => fs.readFileSync(path.join(COLLECTION, p), "utf8");

const VIDEO_MD = read("skills/video/SKILL.md");
const PRESENT_MD = read("skills/present/SKILL.md");
const README = read("README.md");
// The plain-language docs page at bisque.today/docs/video, outside the mirror.
const DOCS = fs.readFileSync(
  path.resolve(COLLECTION, "../../docs/presenter-skill-docs/video.md"),
  "utf8",
);

describe("the skill the present hand-off names is in the collection", () => {
  // present's SKILL.md ends by handing an MP4 request to `video`. If that
  // directory is not published, the hand-off is a dead end for every installer.
  test("present hands off to `video`, and skills/video/SKILL.md exists", () => {
    expect(PRESENT_MD).toContain("`video`");
    expect(fs.existsSync(path.join(COLLECTION, "skills/video/SKILL.md"))).toBe(
      true,
    );
  });

  test("the frontmatter name matches the directory", () => {
    const m = /^---\n([\s\S]*?)\n---/.exec(VIDEO_MD);
    expect(m).not.toBeNull();
    expect(m[1]).toContain("name: video");
  });
});

describe("the README and the skill agree on the platform", () => {
  // Both say macOS-only. A README that promised Linux would send people to an
  // install script that refuses to run.
  test("SKILL.md says macOS only", () => {
    expect(VIDEO_MD).toContain("macOS only");
  });

  test("the README says video needs a Mac, and the docs page names the fallback", () => {
    expect(README).toContain("it needs macOS");
    expect(DOCS.replace(/\s+/g, " ")).toContain("plays in any browser");
  });
});

describe("download sizes live in the skill, not the README", () => {
  // The skill names each download before it starts it. The README stopped
  // quoting sizes on 2026-09-07, so there is one number per download and it
  // cannot disagree with itself.
  test.each([
    ["bisque-video", "15 MB"],
    ["ffmpeg", "12 MB"],
  ])("%s's size is in SKILL.md and not in the README", (_what, size) => {
    expect(VIDEO_MD).toContain(size);
    expect(README).not.toContain(size);
  });
});

describe("the binary path is stated the same way everywhere", () => {
  // `command -v` reports it missing, so every invocation in the skill has to be
  // the absolute path. One relative call teaches the agent the wrong habit.
  test("SKILL.md never invokes a bare `bisque-video`", () => {
    const bare = [...VIDEO_MD.matchAll(/^\s*(?:\$ )?bisque-video\b/gm)];
    expect(bare).toEqual([]);
  });
});
