import { describe, expect, test } from "bun:test";
import {
  isCloneEngine,
  isNamedStudioEngine,
  isStudioEngine,
  localVoiceRef,
} from "../scripts/present.mjs";

/**
 * The bug class these exist for: two places that must agree about one fact,
 * with nothing checking that they do.
 *
 * A named-Studio engine once failed to auto-install because the engine gate was
 * written `/^qwen3-clone-/` while the aligner gate beside it was written
 * `/^qwen3-(clone|voices)-/` — four hand-typed copies of the same idea, one of
 * which had drifted. Separately, `localVoiceRef` could not see the engine, so
 * it read every named speaker as a Kokoro id and rejected it, while the smoke
 * path special-cased the same input correctly.
 *
 * Both are now single implementations. These tests assert the properties that
 * made the drift possible, so a re-introduced copy fails here rather than on a
 * stranger's first publish.
 */

/** Every engine id the registry ships. Kept literal on purpose: this is the
 *  independent list. If bisque-voice adds a family, this file should have to
 *  be edited deliberately rather than inheriting the change silently. */
const CLONE_ENGINES = ["qwen3-clone-06b", "qwen3-clone-17b"];
const NAMED_STUDIO_ENGINES = ["qwen3-voices-06b", "qwen3-voices-17b"];
const NON_STUDIO = ["kokoro", "elevenlabs", "", null, undefined];

/** The nine speakers shipped inside the named-Studio packs. None of them has
 *  Kokoro's `<two letters>_<name>` shape, which is exactly why inferring an
 *  engine from a bare id was wrong. */
const NAMED_SPEAKERS = [
  "serena",
  "vivian",
  "uncle_fu",
  "ryan",
  "aiden",
  "ono_anna",
  "sohee",
  "eric",
  "dylan",
];

describe("engine family predicates", () => {
  test("every clone engine is a clone engine and a Studio engine", () => {
    for (const id of CLONE_ENGINES) {
      expect(isCloneEngine(id)).toBe(true);
      expect(isNamedStudioEngine(id)).toBe(false);
      expect(isStudioEngine(id)).toBe(true);
    }
  });

  test("every named-Studio engine is Studio, and is NOT a clone engine", () => {
    for (const id of NAMED_STUDIO_ENGINES) {
      expect(isNamedStudioEngine(id)).toBe(true);
      expect(isCloneEngine(id)).toBe(false);
      // The regression: this returning false is what skipped the auto-install.
      expect(isStudioEngine(id)).toBe(true);
    }
  });

  test("isStudioEngine is exactly the union of the two families", () => {
    for (const id of [...CLONE_ENGINES, ...NAMED_STUDIO_ENGINES, ...NON_STUDIO]) {
      expect(isStudioEngine(id)).toBe(
        isCloneEngine(id) || isNamedStudioEngine(id),
      );
    }
  });

  test("nothing outside the two families is Studio", () => {
    for (const id of NON_STUDIO) {
      expect(isStudioEngine(id)).toBe(false);
    }
  });

  test("a non-string never throws and is never Studio", () => {
    for (const v of [null, undefined, 42, {}, [], true]) {
      expect(isStudioEngine(v)).toBe(false);
    }
  });
});

describe("localVoiceRef — one resolver for publish and doctor", () => {
  test("qualifies a named speaker with the engine it was saved under", () => {
    for (const speaker of NAMED_SPEAKERS) {
      for (const engine of NAMED_STUDIO_ENGINES) {
        expect(localVoiceRef(speaker, engine)).toBe(`${engine}:${speaker}`);
      }
    }
  });

  test("a named speaker without its engine is NOT guessed as Kokoro", () => {
    // The old behaviour returned `kokoro:ryan` for some inputs and null for
    // others. Either way it was a guess; without an engine there is no answer.
    for (const speaker of NAMED_SPEAKERS) {
      expect(localVoiceRef(speaker, undefined)).toBe(null);
    }
  });

  test("an engine-qualified id passes through untouched", () => {
    expect(localVoiceRef("kokoro:af_heart", "qwen3-voices-06b")).toBe(
      "kokoro:af_heart",
    );
    expect(localVoiceRef("qwen3-clone-17b:me", undefined)).toBe(
      "qwen3-clone-17b:me",
    );
  });

  test("a bare Kokoro-shaped id still gets its engine prefix", () => {
    expect(localVoiceRef("af_heart", "kokoro")).toBe("kokoro:af_heart");
    expect(localVoiceRef("bm_george", undefined)).toBe("kokoro:bm_george");
  });

  test("a cloud voice id is not speakable locally", () => {
    expect(localVoiceRef("21m00Tcm4TlvDq8ikWAM", undefined)).toBe(null);
    expect(localVoiceRef("", "kokoro")).toBe(null);
    expect(localVoiceRef(undefined, "kokoro")).toBe(null);
  });

  test("a nonsense pairing falls through rather than inventing a ref", () => {
    // kokoro + a named-Studio speaker names nothing that can be synthesized.
    expect(localVoiceRef("ryan", "kokoro")).toBe(null);
  });
});
