import { describe, expect, test } from "bun:test";
import { describeOmissions, isGenerated, selectDiff } from "./select-diff.ts";

describe("isGenerated", () => {
  test("lockfiles, bundles, snapshots, vendored dirs", () => {
    for (const f of [
      "package-lock.json",
      "apps/web/bun.lock",
      "Cargo.lock",
      "dist/app.min.js",
      "src/__snapshots__/a.snap",
      "vendor/x/y.go",
      "api.pb.go",
    ]) {
      expect(isGenerated(f)).toBe(true);
    }
  });
  test("source files are not", () => {
    for (const f of [
      "src/main.ts",
      "README.md",
      "Cargo.toml",
      "lib/lock.rs",
      "docs/build.md",
    ]) {
      expect(isGenerated(f)).toBe(false);
    }
  });
});

describe("selectDiff", () => {
  const file = (filename: string, patch?: string) => ({
    filename,
    additions: 1,
    deletions: 0,
    patch,
  });

  test("keeps source, skips generated and patchless, reports both", () => {
    const sel = selectDiff([
      file("src/a.ts", "+a"),
      file("bun.lock", "+lots"),
      file("logo.png"),
      file("src/b.ts", "+b"),
    ]);
    expect(sel.patch).toContain("a/src/a.ts");
    expect(sel.patch).toContain("a/src/b.ts");
    expect(sel.patch).not.toContain("bun.lock");
    expect(sel.skipped.map((s) => s.filename)).toEqual([
      "bun.lock",
      "logo.png",
    ]);
    expect(sel.cut).toEqual([]);
  });

  test("caps a huge file and keeps the ones after it", () => {
    const sel = selectDiff(
      [file("big.ts", "x".repeat(50)), file("small.ts", "+s")],
      10,
      1000,
    );
    expect(sel.cut).toEqual(["big.ts"]);
    expect(sel.patch).toContain("more bytes of this file's diff not shown");
    expect(sel.patch).toContain("a/small.ts");
  });

  test("stops at the total budget and names what it left out", () => {
    const sel = selectDiff(
      [
        file("a.ts", "x".repeat(30)),
        file("b.ts", "y".repeat(30)),
        file("c.ts", "+c"),
      ],
      100,
      60,
    );
    expect(sel.patch).toContain("a/a.ts");
    expect(sel.patch).toContain("a/b.ts");
    expect(sel.skipped).toEqual([
      { filename: "c.ts", reason: "diff budget spent" },
    ]);
  });

  test("omissions read as a list the agent can cite", () => {
    const sel = selectDiff(
      [file("bun.lock", "+l"), file("big.ts", "x".repeat(50))],
      10,
      1000,
    );
    const text = describeOmissions(sel);
    expect(text).toContain("## Not fully in diff.patch");
    expect(text).toContain("- bun.lock: generated file");
    expect(text).toContain("- big.ts: shown up to");
    expect(describeOmissions(selectDiff([file("a.ts", "+a")]))).toBe("");
  });
});
