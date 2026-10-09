import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  presentationIdFromWatchUrl,
  readLiveState,
  resumeWrites,
} from "../scripts/present.mjs";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "present-resume-"));

// The revision an append is written against comes from this file, so a stale
// or foreign one must never be sent as if it were current.
describe("the live state a directory records", () => {
  test("is read for the presentation it names", () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, ".present-live.json"),
      JSON.stringify({ presentationId: "p1", revision: 3, speechSpeed: 1.1 }),
    );
    expect(readLiveState(dir, "p1")).toMatchObject({ revision: 3 });
    expect(readLiveState(dir, "p2")).toBeNull();
  });

  test("a missing, unreadable or revisionless file is no state", () => {
    const dir = tempDir();
    expect(readLiveState(dir, "p1")).toBeNull();
    fs.writeFileSync(path.join(dir, ".present-live.json"), "{not json");
    expect(readLiveState(dir, "p1")).toBeNull();
    fs.writeFileSync(
      path.join(dir, ".present-live.json"),
      JSON.stringify({ presentationId: "p1", revision: 0 }),
    );
    expect(readLiveState(dir, "p1")).toBeNull();
  });
});

describe("what resume writes", () => {
  const state = { indexHtml: "<section>1</section>", contextMd: "# ctx" };

  test("into an empty directory: the slides and the context", () => {
    const { writes, clashes } = resumeWrites(tempDir(), state);
    expect(writes.map((w) => w.name)).toEqual(["index.html", "context.md"]);
    expect(clashes).toEqual([]);
  });

  test("over the same bytes: nothing clashes, so it resumes in place", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "index.html"), state.indexHtml);
    expect(resumeWrites(dir, state).clashes).toEqual([]);
  });

  test("over other work: the clash is named and nothing is replaced", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "index.html"), "<section>mine</section>");
    expect(resumeWrites(dir, state).clashes).toEqual(["index.html"]);
  });
});

// A publish that dies while narrating has printed only its watch URL. The
// server derives the id of a presentation published without one from the
// account and the slug, so the URL is enough to resume it.
describe("the presentation a watch URL names", () => {
  const uid = "oO8sz40jr4S6FyNgCbGvQZgyQsu1";

  test("is the id the server gave it", () => {
    // Recorded from a live presentation on bisque.today, 2026-10-07.
    expect(
      presentationIdFromWatchUrl(
        "https://bisque.today/p/superveggie-delivery/test-resuming-a-live-presentation-foreman-check",
        uid,
      ),
    ).toBe("test-resuming-a-live-presentation-foreman-check-3ef2c8");
  });

  test("without a scheme, or with a query, is the same presentation", () => {
    const id = "test-interrupted-live-publish-foreman-check-5171d3";
    for (const url of [
      "bisque.today/p/superveggie-delivery/test-interrupted-live-publish-foreman-check",
      "https://bisque.cloud/p/superveggie-delivery/test-interrupted-live-publish-foreman-check?slide=2",
    ]) {
      expect(presentationIdFromWatchUrl(url, uid)).toBe(id);
    }
  });

  test("belongs to the account asking", () => {
    const url = "https://bisque.today/p/someone/office-hours";
    expect(presentationIdFromWatchUrl(url, "a")).not.toBe(
      presentationIdFromWatchUrl(url, "b"),
    );
  });

  test("an id, or a page that is not a watch page, is not a watch URL", () => {
    expect(presentationIdFromWatchUrl("office-hours-3f9a1c", uid)).toBeNull();
    expect(
      presentationIdFromWatchUrl("https://bisque.today/docs/present", uid),
    ).toBeNull();
    expect(
      presentationIdFromWatchUrl("https://bisque.today/p/someone", uid),
    ).toBeNull();
  });
});
