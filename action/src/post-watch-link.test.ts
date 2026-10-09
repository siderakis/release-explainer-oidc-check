import { expect, test } from "bun:test";

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
