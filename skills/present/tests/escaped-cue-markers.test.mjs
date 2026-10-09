import { describe, expect, test } from "bun:test";
import { lintPresentation } from "../scripts/present.mjs";

/**
 * The bug class these exist for: narration that publishes clean and plays
 * wrong.
 *
 * A presentation went out with its cue markers HTML-escaped —
 * `&lt;&lt;reveal target=s2a&gt;&gt;` instead of `<<reveal target=s2a>>`, 13
 * of them. The marker parser matches the literal `<<…>>` form, so the escaped
 * ones were neither stripped from the narration nor fired as cues: the voice
 * read "reveal target s2a" aloud 13 times and not one element revealed. It
 * cost 88 seconds of synthesis, and a person watching it found the defect.
 * Removing the escaping took the runtime to 68.8 seconds.
 *
 * So the lint refuses the publish before synthesis starts.
 */

const slide = (notes, body = "<h1>Title</h1>") =>
  `<div class="slides"><section id="s2">${body}<aside class="notes">${notes}</aside></section></div>`;

describe("escaped cue markers", () => {
  test("an escaped reveal fails the lint, naming the slide and the marker", () => {
    const problems = lintPresentation(
      slide(
        "Revenue is up. &lt;&lt;reveal target=s2a&gt;&gt; That's the number.",
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("slide 1 (#s2)");
    expect(problems[0]).toContain("&lt;&lt;reveal target=s2a&gt;&gt;");
    expect(problems[0]).toContain("<<reveal target=s2a>>");
    expect(problems[0]).toContain("HTML-escaped");
  });

  test("every escaped marker on the slide is reported, not just the first", () => {
    const problems = lintPresentation(
      slide(
        "&lt;&lt;fire pop&gt;&gt; One. &lt;&lt;reveal target=a&gt;&gt; Two. " +
          "&lt;&lt;set accent=#ff5da2&gt;&gt; Three.",
      ),
    );
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toContain("<<fire pop>>");
    expect(problems.join("\n")).toContain("<<reveal target=a>>");
    expect(problems.join("\n")).toContain("<<set accent=#ff5da2>>");
  });

  /** The rule is the grammar, so a command name nobody has written yet is
   *  caught the same way `reveal` is. */
  test("a command this file has never heard of is caught too", () => {
    const problems = lintPresentation(
      slide("Watch this. &lt;&lt;summon target=dragon count=3&gt;&gt; There."),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("<<summon target=dragon count=3>>");
  });

  test("escaping one delimiter breaks the marker the same way", () => {
    const openerOnly = lintPresentation(
      slide("Up next. &lt;&lt;reveal target=a>> Here it is."),
    );
    expect(openerOnly).toHaveLength(1);
    expect(openerOnly[0]).toContain("<<reveal target=a>>");

    const closerOnly = lintPresentation(
      slide("Up next. <<reveal target=a&gt;&gt; Here it is."),
    );
    expect(closerOnly).toHaveLength(1);
    expect(closerOnly[0]).toContain("<<reveal target=a>>");
  });

  test("literal markers publish, whatever the command is", () => {
    const problems = lintPresentation(
      slide(
        '<<fire sound src="assets/jingle.mp3" volume=70>> Welcome back. ' +
          "<<reveal target=a>> The number. <<set accent=#ff5da2>> " +
          "<<fire lines target=code range=5-8>> These lines.",
        '<h1>Title</h1><p data-step="1" data-cue-target="a">The number</p>',
      ),
    );
    expect(problems).toEqual([]);
  });

  /** A slide teaching the marker syntax has to escape it to put it on screen.
   *  That is correct HTML, and the check never looks outside the notes. */
  test("escaped markers in the slide body are left alone", () => {
    const problems = lintPresentation(
      slide(
        "Here is how a reveal is written. <<reveal target=a>> Like that.",
        "<pre><code>&lt;&lt;reveal target=a&gt;&gt;</code></pre>" +
          '<p data-step="1" data-cue-target="a">Like that</p>',
      ),
    );
    expect(problems).toEqual([]);
  });

  test("prose with no marker in it is fine", () => {
    expect(lintPresentation(slide("Just a sentence about revenue."))).toEqual(
      [],
    );
  });
});
