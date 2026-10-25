import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The "Name the installed speech models" step runs with `if: always()`, so it
// runs on a fresh runner with no cached voice too: a skipped pull request or a
// run that failed before narration never creates ~/.bisque/models. These run
// the step's own script from action.yml with the flags GitHub gives
// `shell: bash` (`bash --noprofile --norc -eo pipefail {0}`).

function stepScript(): string {
  const yml = readFileSync(
    new URL("../../action.yml", import.meta.url),
    "utf8",
  );
  const block =
    /- name: Name the installed speech models\n[\s\S]*?\n {6}run: \|\n((?: {8}.*\n)+)/.exec(
      yml,
    );
  expect(block).not.toBeNull();
  return block![1].replace(/^ {8}/gm, "");
}

function runStep(home: string) {
  const outputFile = join(home, "github-output");
  const r = spawnSync(
    "bash",
    ["--noprofile", "--norc", "-eo", "pipefail", "-c", stepScript()],
    {
      env: { PATH: process.env.PATH, HOME: home, GITHUB_OUTPUT: outputFile },
      encoding: "utf8",
    },
  );
  let output = "";
  try {
    output = readFileSync(outputFile, "utf8");
  } catch {}
  return { status: r.status, output };
}

test("a runner with no models folder names no models and passes", () => {
  const home = mkdtempSync(join(tmpdir(), "no-models-"));
  expect(runStep(home)).toEqual({ status: 0, output: "key=\n" });
});

test("an empty models folder names no models and passes", () => {
  const home = mkdtempSync(join(tmpdir(), "empty-models-"));
  mkdirSync(join(home, ".bisque", "models"), { recursive: true });
  expect(runStep(home)).toEqual({ status: 0, output: "key=\n" });
});

test("installed models are named in sorted order", () => {
  const home = mkdtempSync(join(tmpdir(), "models-"));
  for (const name of ["qwen3", "kokoro"]) {
    mkdirSync(join(home, ".bisque", "models", name), { recursive: true });
  }
  expect(runStep(home)).toEqual({ status: 0, output: "key=kokoro+qwen3\n" });
});
