import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const validator = join(import.meta.dir, "check-presentation-structure.ts");

function run(dir: string) {
  const p = Bun.spawnSync(["node", validator, dir]);
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
}

const good = `<!doctype html><html><head>
<meta name="presentation-format" content="html-presentation/v1" />
</head><body><div class="slides">
<section id="a" data-background="#fff">
  <div data-layout="landscape">x</div>
  <div data-layout="vertical">x</div>
  <aside class="notes">hello</aside>
</section>
</div></body></html>`;

describe("check-presentation-structure.ts", () => {
  test("accepts a section with both layouts, one narration, a background", () => {
    const dir = mkdtempSync(join(tmpdir(), "re-"));
    writeFileSync(join(dir, "index.html"), good);
    writeFileSync(join(dir, "context.md"), "# ctx");
    const r = run(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain("1 slides");
  });

  test("rejects a missing vertical block, a script, and a CDN font", () => {
    const dir = mkdtempSync(join(tmpdir(), "re-"));
    writeFileSync(
      join(dir, "index.html"),
      good
        .replace('<div data-layout="vertical">x</div>', "")
        .replace(
          "</head>",
          '<script>1</script><link href="https://fonts.googleapis.com/x" /></head>',
        ),
    );
    writeFileSync(join(dir, "context.md"), "# ctx");
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("no vertical block");
    expect(r.out).toContain("<script>");
    expect(r.out).toContain("network reference");
  });

  test("rejects a missing index.html", () => {
    const dir = mkdtempSync(join(tmpdir(), "re-"));
    const r = run(dir);
    expect(r.code).toBe(1);
  });
});
