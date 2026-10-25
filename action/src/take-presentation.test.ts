import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { narratedVoice, presentationFolder } from "./take-presentation.ts";

function workspace(): string {
  const ws = mkdtempSync(join(tmpdir(), "take-presentation-"));
  mkdirSync(join(ws, "explainer", "assets"), { recursive: true });
  writeFileSync(join(ws, "explainer", "index.html"), "<html></html>");
  writeFileSync(join(ws, "explainer", "context.md"), "# context");
  writeFileSync(join(ws, "explainer", "assets", "a.png"), "png");
  return ws;
}

test("a relative path is read from the workspace", () => {
  const ws = workspace();
  expect(presentationFolder("explainer", ws)).toEqual({
    dir: join(ws, "explainer"),
  });
  expect(presentationFolder(join(ws, "explainer"), "/elsewhere")).toEqual({
    dir: join(ws, "explainer"),
  });
});

test("a missing folder or index.html is refused with what to check", () => {
  const ws = workspace();
  const missing = presentationFolder("nowhere", ws);
  expect("error" in missing && missing.error).toContain("is not a folder");
  mkdirSync(join(ws, "empty"));
  const empty = presentationFolder("empty", ws);
  expect("error" in empty && empty.error).toContain("has no index.html");
  const file = presentationFolder("explainer/index.html", ws);
  expect("error" in file && file.error).toContain("is not a folder");
});

test("the step copies the folder to where the agent's output would be", () => {
  const ws = workspace();
  const work = join(ws, "work");
  mkdirSync(join(work, "out"), { recursive: true });
  writeFileSync(join(work, "out", "stale.txt"), "from before");
  const r = spawnSync(
    "node",
    [new URL("./take-presentation.ts", import.meta.url).pathname],
    {
      env: {
        ...process.env,
        PRESENTATION: "explainer",
        GITHUB_WORKSPACE: ws,
        WORK: work,
      },
      encoding: "utf8",
    },
  );
  expect(r.status).toBe(0);
  for (const f of ["index.html", "context.md", "assets/a.png"])
    expect(existsSync(join(work, "out", f))).toBe(true);
  expect(existsSync(join(work, "out", "stale.txt"))).toBe(false);
});

function sidecar(dir: string, key: string, voice: string, speed: number) {
  mkdirSync(join(dir, "audio"), { recursive: true });
  writeFileSync(
    join(dir, "audio", `${key}.json`),
    JSON.stringify({ text: "Hi.", voice, speed, result: { hash: "x" } }),
  );
}

test("the narration's voice and speed come from its sidecars", () => {
  const dir = join(workspace(), "explainer");
  expect(narratedVoice(dir)).toBeNull();
  sidecar(dir, "slide-1", "kokoro:af_heart", 1);
  sidecar(dir, "slide-2", "kokoro:af_heart", 1);
  writeFileSync(join(dir, "audio", "slide-1.mp3"), "mp3");
  expect(narratedVoice(dir)).toEqual({
    voice: "kokoro:af_heart",
    speed: 1,
    slides: 2,
  });
});

test("slides narrated in different voices name none", () => {
  const dir = join(workspace(), "explainer");
  sidecar(dir, "slide-1", "kokoro:af_heart", 1);
  sidecar(dir, "slide-2", "kokoro:am_michael", 1);
  expect(narratedVoice(dir)).toBeNull();
  const other = join(workspace(), "explainer");
  sidecar(other, "slide-1", "kokoro:af_heart", 1);
  sidecar(other, "slide-2", "kokoro:af_heart", 1.1);
  expect(narratedVoice(other)).toBeNull();
});

test("the step names the narrated voice and speed as outputs", () => {
  const ws = workspace();
  sidecar(join(ws, "explainer"), "slide-1", "kokoro:af_heart", 1);
  const outputs = join(ws, "github-output");
  writeFileSync(outputs, "");
  const r = spawnSync(
    "node",
    [new URL("./take-presentation.ts", import.meta.url).pathname],
    {
      env: {
        ...process.env,
        PRESENTATION: "explainer",
        GITHUB_WORKSPACE: ws,
        GITHUB_OUTPUT: outputs,
        WORK: join(ws, "work"),
      },
      encoding: "utf8",
    },
  );
  expect(r.status).toBe(0);
  expect(readFileSync(outputs, "utf8")).toBe(
    "voice=kokoro:af_heart\nspeed=1\n",
  );
});
