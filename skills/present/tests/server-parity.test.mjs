import { describe, expect, test } from "bun:test";
import {
  lintPresentation,
  shellStylingSelectors,
} from "../scripts/present.mjs";

/**
 * Two checks the server ran on every publish and `plan` did not: a slide
 * missing its vertical block, and CSS that draws over the player itself. An
 * agent that ran `plan` clean could still be refused at publish, after it had
 * stopped and could no longer fix anything. These mirror
 * packages/presentation-format (html-build.ts, shell-css.ts).
 */

const doc = (sections, style = "") =>
  `<html><head>${style}</head><body><div class="slides">${sections}</div></body></html>`;

describe("dual layout", () => {
  test("a landscape-only slide is reported", () => {
    const problems = lintPresentation(
      doc('<section id="a"><div data-layout="landscape">L</div></section>'),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      'slide 1 (#a): missing the [data-layout="vertical"] block',
    );
  });

  test("a slide with both blocks passes", () => {
    expect(
      lintPresentation(
        doc(
          '<section id="a"><div data-layout="landscape">L</div><div data-layout="vertical">V</div></section>',
        ),
      ),
    ).toEqual([]);
  });
});

describe("CSS over the player shell", () => {
  const both =
    '<section id="a"><div data-layout="landscape">L</div><div data-layout="vertical">V</div></section>';

  test("a bare [data-layout]::before box is reported", () => {
    const problems = lintPresentation(
      doc(both, '<style>[data-layout]::before { content: ""; }</style>'),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`[data-layout]::before`");
  });

  test.each([
    ["body::after { content: 'x'; }", ["body::after"]],
    [
      ":root [data-layout]::before { content: ''; }",
      [":root [data-layout]::before"],
    ],
    [
      "@media (min-width: 1px) { [data-layout]::after { content: ''; } }",
      ["[data-layout]::after"],
    ],
    ["section > [data-layout]::before { content: ''; }", []],
    ["[data-layout]::before { content: none; }", []],
    [".card::before { content: ''; }", []],
    ["/* [data-layout]::before { content: ''; } */", []],
  ])("%s", (css, expected) => {
    expect(
      shellStylingSelectors(css.replace(/\/\*[\s\S]*?\*\//g, " ")),
    ).toEqual(expected);
  });
});
