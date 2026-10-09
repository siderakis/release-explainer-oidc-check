import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FALLBACK_VOICE, voiceArgs } from "./voice-args.ts";

describe("voiceArgs", () => {
  test("an omitted voice passes no --voice, only the fallback", () => {
    // --voice outranks the channel's and account's saved voice, so passing
    // one by default is what made every explainer ignore the saved voice.
    for (const input of [undefined, "", "   "]) {
      const args = voiceArgs(input);
      expect(args).not.toContain("--voice");
      expect(args).toEqual(["--fallback-voice", FALLBACK_VOICE]);
    }
  });

  test("an explicit voice is passed as --voice, and nothing else", () => {
    expect(voiceArgs("qwen3-voices-17b:ryan")).toEqual([
      "--voice",
      "qwen3-voices-17b:ryan",
    ]);
    expect(voiceArgs(" kokoro:am_michael ")).toEqual([
      "--voice",
      "kokoro:am_michael",
    ]);
  });

  test("an explicit voice must name its engine", () => {
    expect(() => voiceArgs("af_heart")).toThrow(/engine-qualified/);
  });
});

test("action.yml defaults the voice input to empty", () => {
  const yml = readFileSync(
    new URL("../../action.yml", import.meta.url),
    "utf8",
  );
  const block = /\n {2}voice:\n([\s\S]*?)\n {2}[a-z-]+:\n/.exec(yml);
  expect(block).not.toBeNull();
  expect(block![1]).toMatch(/\n {4}default: ""/);
});
