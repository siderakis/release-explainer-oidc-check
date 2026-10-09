import { describe, expect, test } from "bun:test";
import { lintPresentation } from "../scripts/present.mjs";

/**
 * The bug class these exist for: a slide that looks finished and plays
 * incomplete.
 *
 * An element carrying `data-step` is hidden until a `<<reveal>>` names its
 * `data-cue-target`. Name none and it is hidden for the whole slide; name only
 * the first row of a list and the rest never arrive. Neither is visible in a
 * screenshot, because a screenshot shows every step at once, so this survives
 * every review that is not a playback.
 *
 * Three shipped presentations carried it. A system-card slide narrated "or
 * point a camera at the code" over a QR code that never appeared. A teardown
 * slide stepped in three co-founders and revealed two. A showcase fired
 * `<<reveal target=ring>>` at an element that did not exist.
 *
 * So the lint refuses the publish before synthesis starts.
 */

const slide = (notes, body) =>
  `<div class="slides"><section id="s2">${body}<aside class="notes">${notes}</aside></section></div>`;

describe("reveal coverage", () => {
  test("a stepped element no marker names fails the lint", () => {
    const problems = lintPresentation(
      slide(
        "Every claim traces back to the source. <<reveal target=url>> The card is free online.",
        '<a data-step="1" data-cue-target="url">anthropic.com</a>' +
          '<div data-step="1" data-cue-target="qr">QR</div>',
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("slide 1 (#s2)");
    expect(problems[0]).toContain("`qr`");
    expect(problems[0]).toContain("stays hidden for the whole slide");
  });

  /** The shape that cost three co-founders their entry: siblings share a step,
   *  the narration names one, and the rest are silently dropped. */
  test("every unnamed member of a step group is reported", () => {
    const problems = lintPresentation(
      slide(
        "The founders. <<reveal target=lee>> Lee ran product.",
        [
          '<li data-step="1" data-cue-target="lee">Lee</li>',
          '<li data-step="2" data-cue-target="noronha">Noronha</li>',
          '<li data-step="2" data-cue-target="fox">Fox</li>',
        ].join(""),
      ),
    );
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("`noronha`");
    expect(problems.join("\n")).toContain("`fox`");
  });

  test("a marker naming an element the slide lacks is reported", () => {
    const problems = lintPresentation(
      slide(
        "Watch the dial. <<reveal target=ring>> There it goes.",
        "<h1>Control</h1>",
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`<<reveal target=ring>>`");
    expect(problems[0]).toContain("reveals nothing");
  });

  test("a stepped element with no cue target at all is reported once per slide", () => {
    const problems = lintPresentation(
      slide(
        "Here they are. <<reveal target=a>> Both of them.",
        [
          '<p data-step="1" data-cue-target="a">Named</p>',
          '<p data-step="1">Unnamed</p>',
          '<p data-step="2">Also unnamed</p>',
        ].join(""),
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("2 element(s)");
    expect(problems[0]).toContain("data-cue-target");
  });

  /** Both layout blocks carry the same ids for the same beat, so one marker
   *  covers both and the problem is reported once, not twice. */
  test("the same cue id in both layout blocks is one marker's job", () => {
    const problems = lintPresentation(
      slide(
        "The number. <<reveal target=n>> Up nineteen percent.",
        [
          '<div data-layout="landscape"><b data-step="1" data-cue-target="n">19%</b></div>',
          '<div data-layout="vertical"><b data-step="1" data-cue-target="n">19%</b></div>',
        ].join(""),
      ),
    );
    expect(problems).toEqual([]);
  });

  test("step 0 is on screen from the start and needs no marker", () => {
    const problems = lintPresentation(
      slide(
        "The heading lands first. <<reveal target=body>> Then the detail.",
        [
          '<h2 data-step="0" data-cue-target="head">The claim</h2>',
          '<p data-step="1" data-cue-target="body">The evidence</p>',
        ].join(""),
      ),
    );
    expect(problems).toEqual([]);
  });

  /** A slide with no narration is stepped by keyboard on purpose. Flagging it
   *  would refuse a legitimate presentation that never had notes to name
   *  anything with. */
  test("a slide with no notes is exempt", () => {
    const problems = lintPresentation(
      '<div class="slides"><section id="s2">' +
        '<p data-step="1" data-cue-target="a">Manual</p>' +
        "</section></div>",
    );
    expect(problems).toEqual([]);
  });

  test("an empty notes block is exempt the same way", () => {
    const problems = lintPresentation(
      slide("   ", '<p data-step="1" data-cue-target="a">Manual</p>'),
    );
    expect(problems).toEqual([]);
  });

  /** `<<fire lines target=…>>` and friends drive a visible element without
   *  revealing it, so they neither satisfy a reveal nor count as a dangling
   *  one. */
  test("a fire cue is not a reveal and is not mistaken for one", () => {
    const problems = lintPresentation(
      slide(
        "Walk the block. <<fire lines target=code range=5-8>> These lines.",
        '<pre data-cue-target="code">…</pre>',
      ),
    );
    expect(problems).toEqual([]);
  });

  test("a fully wired slide passes", () => {
    const problems = lintPresentation(
      slide(
        "Two records. <<reveal target=a>> Product context. <<reveal target=b>> The visual system.",
        '<div data-step="1" data-cue-target="a">PRODUCT.md</div>' +
          '<div data-step="2" data-cue-target="b">DESIGN.md</div>',
      ),
    );
    expect(problems).toEqual([]);
  });
});

/** `<<advance>>` is the older cue scheme: it reveals the next step group in
 *  order without naming it, so bare `data-step` is correct there. Flagging it
 *  called 12 working presentations broken. */
describe("advance-driven slides", () => {
  const slide = (notes, body) =>
    `<div class="slides"><section id="s2">${body}<aside class="notes">${notes}</aside></section></div>`;

  test("bare data-step with <<advance>> is not a defect", () => {
    const problems = lintPresentation(
      slide(
        "The loss barely predicted skill. <<advance>> Chasing it costs more. <<advance>> So measure the skill.",
        '<span data-step="1">-0.18</span><span data-step="2">2.5x</span>',
      ),
    );
    expect(problems).toEqual([]);
  });

  test("an advance slide is exempt even when it also names a target", () => {
    const problems = lintPresentation(
      slide(
        "First. <<advance>> Second. <<reveal target=c>> Third.",
        '<span data-step="1">a</span><span data-cue-target="c">c</span>',
      ),
    );
    expect(problems).toEqual([]);
  });
});
