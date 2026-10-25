// Step, publish-only: copy the presentation an earlier job wrote into
// $WORK/out, where the agent's output would be, so the structure check and
// the publish step run on it unchanged. For a workflow that authors with
// anthropics/claude-code-action, which removes the means to mint the run's
// GitHub identity from Claude's session, so the agent there cannot publish.
import { cpSync, existsSync, lstatSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fail, workDir } from "./action-step.ts";

/**
 * The folder to publish, or the reason it cannot be. A relative path is read
 * from the workspace, the way `actions/upload-artifact` reads `path`.
 */
export function presentationFolder(
  input: string,
  workspace: string,
): { dir: string } | { error: string } {
  const given = input.trim();
  if (!given) return { error: "presentation is empty." };
  const dir = isAbsolute(given) ? given : resolve(workspace, given);
  if (!existsSync(dir) || !lstatSync(dir).isDirectory())
    return {
      error: `presentation: ${dir} is not a folder. Point it at the folder the earlier job wrote, after downloading it in this job.`,
    };
  if (!existsSync(join(dir, "index.html")))
    return {
      error: `presentation: ${dir} has no index.html. The job that authored it may have stopped early or written it somewhere else; its log says which.`,
    };
  return { dir };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const found = presentationFolder(
    process.env.PRESENTATION ?? "",
    process.env.GITHUB_WORKSPACE || process.cwd(),
  );
  if ("error" in found) fail(found.error);
  const out = join(workDir(), "out");
  rmSync(out, { recursive: true, force: true });
  cpSync(found.dir, out, { recursive: true });
  console.log(`publishing the presentation in ${found.dir}`);
}
