import { describe, expect, test } from "bun:test";
import { serverVoiceId } from "../scripts/present.mjs";

/**
 * The bug class: a republish that names its voice in a shape the server
 * drops. handy-0-9-8 was narrated server-side in an ElevenLabs voice; the
 * republish named `cloud:<id>`, this function returned undefined, and the
 * manifest recorded `kokoro:af_heart` instead of the voice that spoke.
 */
describe("serverVoiceId", () => {
  test("keeps a cloud voice", () => {
    expect(serverVoiceId("cloud:DkVHY251JcjFstLRlihO")).toBe(
      "cloud:DkVHY251JcjFstLRlihO",
    );
    expect(serverVoiceId("DkVHY251JcjFstLRlihO")).toBe(
      "cloud:DkVHY251JcjFstLRlihO",
    );
  });

  test("tags a Kokoro voice", () => {
    expect(serverVoiceId("af_heart")).toBe("kokoro:af_heart");
    expect(serverVoiceId("kokoro:af_heart")).toBe("kokoro:af_heart");
    expect(serverVoiceId("local:af_heart")).toBe("kokoro:af_heart");
  });

  test("omits a voice of another engine, and a mismatched tag", () => {
    expect(serverVoiceId("qwen3-voices-17b:ryan")).toBeUndefined();
    expect(serverVoiceId("cloud:af_heart")).toBeUndefined();
    expect(serverVoiceId(undefined)).toBeUndefined();
  });
});
