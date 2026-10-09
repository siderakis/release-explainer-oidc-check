import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  binaryPath,
  CHECKSUMS,
  sha256,
  targetTriple,
  VERSION,
} from "./install-bisque-voice.ts";

describe("targetTriple", () => {
  test("maps every platform bisque-voice builds for", () => {
    expect(targetTriple("darwin", "arm64")).toBe("aarch64-apple-darwin");
    expect(targetTriple("darwin", "x64")).toBe("x86_64-apple-darwin");
    expect(targetTriple("linux", "x64")).toBe("x86_64-unknown-linux-gnu");
    expect(targetTriple("linux", "arm64")).toBe("aarch64-unknown-linux-gnu");
    expect(targetTriple("win32", "x64")).toBe("x86_64-pc-windows-msvc");
  });

  test("an unsupported platform names the ones that exist", () => {
    expect(() => targetTriple("freebsd", "x64")).toThrow(
      /aarch64-apple-darwin/,
    );
  });
});

test("every triple it can produce has a checksum pinned", () => {
  for (const [platform, arch] of [
    ["darwin", "arm64"],
    ["darwin", "x64"],
    ["linux", "x64"],
    ["linux", "arm64"],
    ["win32", "x64"],
  ] as const) {
    const triple = targetTriple(platform, arch);
    expect(CHECKSUMS[triple]).toMatch(/^[0-9a-f]{64}$/);
  }
});

test("the pinned version is a plain release number", () => {
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test("the binary lands where the upstream installer puts it", () => {
  expect(binaryPath("/home/x")).toBe(
    join(
      "/home/x",
      ".bisque",
      "bin",
      process.platform === "win32" ? "bisque-voice.exe" : "bisque-voice",
    ),
  );
});

test("sha256 hashes file contents", () => {
  const f = join(mkdtempSync(join(tmpdir(), "bv-")), "a.txt");
  writeFileSync(f, "abc");
  // Known SHA-256 of "abc".
  expect(sha256(f)).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
