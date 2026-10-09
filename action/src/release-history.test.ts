import { describe, expect, test } from "bun:test";
import { previousRelease, slugify } from "./release-history.ts";

describe("previousRelease", () => {
  const tags = [
    "bisque-mac-v0.0.66",
    "imessage-bridge-v1.0.12",
    "imessage-bridge-v1.0.11",
    "bisque-mac-v0.0.65",
    "v0.9.0",
  ];
  test("same prefix in a multi-product repo", () => {
    expect(previousRelease(tags, "bisque-mac-v0.0.66")).toBe(
      "bisque-mac-v0.0.65",
    );
    expect(previousRelease(tags, "imessage-bridge-v1.0.12")).toBe(
      "imessage-bridge-v1.0.11",
    );
  });
  test("plain version tags", () => {
    expect(previousRelease(["v1.2.0", "v1.1.0", "v1.0.0"], "v1.2.0")).toBe(
      "v1.1.0",
    );
    expect(previousRelease(["1.2.0", "1.1.0"], "1.2.0")).toBe("1.1.0");
  });
  test("first release of a thing, or an unknown tag, has no previous", () => {
    expect(previousRelease(tags, "v0.9.0")).toBe("");
    expect(previousRelease(tags, "nope")).toBe("");
  });
});

describe("slugify", () => {
  test("tags and titles", () => {
    expect(slugify("bisque-mac-v0.0.66")).toBe("bisque-mac-v0-0-66");
    expect(slugify("Paid content: buy a presentation, or subscribe!")).toBe(
      "paid-content-buy-a-presentation-or-subscribe",
    );
  });
});
