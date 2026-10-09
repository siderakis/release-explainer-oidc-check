import { describe, expect, test } from "bun:test";
import { lintPresentation } from "../scripts/present.mjs";

/**
 * The bug class this exists for: a marker written where nothing will speak it.
 *
 * A published presentation carried "The [iOS](eye oh ess) app now keeps
 * several accounts signed in at once." on the slide itself. Only the narration
 * is spoken, so the marker changed no sound; it showed its own brackets to
 * every viewer, and to every reader of the transcript built from that slide.
 *
 * So the lint refuses the publish, and says where the marker belongs.
 */

const doc = (sections) =>
  `<html><head><meta name="presentation-format" content="html-presentation/v1" /></head>` +
  `<body><div class="slides">${sections}</div></body></html>`;

const slide = (body, notes = "Plain narration.") =>
  `<section id="ios"><div data-layout="landscape">${body}</div>` +
  `<div data-layout="vertical">V</div>` +
  `<aside class="notes">${notes}</aside></section>`;

describe("a pronunciation marker in slide copy", () => {
  test("fails the lint, naming the slide and the marker", () => {
    const problems = lintPresentation(
      doc(slide("<p>The [iOS](eye oh ess) app keeps you signed in.</p>")),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("slide 1 (#ios)");
    expect(problems[0]).toContain("[iOS](eye oh ess)");
    expect(problems[0]).toContain("never spoken");
  });

  test("the IPA form on a slide is caught too", () => {
    const problems = lintPresentation(
      doc(slide("<h2>[iOS](/ˌIˌOˈɛs/) accounts</h2>")),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("[iOS](/ˌIˌOˈɛs/)");
  });

  test("the same marker in the narration is what the marker is for", () => {
    const problems = lintPresentation(
      doc(slide("<p>Accounts</p>", "The [iOS](/ˌIˌOˈɛs/) app, signed in.")),
    );
    expect(problems).toEqual([]);
  });

  test("a markdown link on a slide is a link, not a marker", () => {
    const problems = lintPresentation(
      doc(
        slide(
          "<p>Read [the spec](https://bisque.today/docs) and [notes](./notes.md) and [top](#top).</p>",
        ),
      ),
    );
    expect(problems).toEqual([]);
  });

  test("a slide showing the marker in code still publishes", () => {
    const problems = lintPresentation(
      doc(slide("<pre><code>[iOS](eye oh ess)</code></pre>")),
    );
    expect(problems).toEqual([]);
  });
});
