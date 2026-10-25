import { expect, test } from "bun:test";
import { planComment } from "./judgment.ts";
import { resolveRun } from "./model-provider.ts";
import { secretFor, setupComment, workflowPath } from "./missing-key.ts";

test("only a run with no key at all is a missing key", () => {
  expect(resolveRun({})).toMatchObject({ missingKey: true });
  expect(resolveRun({ anthropic: "  " })).toMatchObject({ missingKey: true });
  // A key for the wrong provider is a different mistake, and still fails.
  expect(
    resolveRun({ openai: "k" }, "anthropic/claude-opus-5"),
  ).not.toHaveProperty("missingKey");
});

test("the secret is the one the workflow passes to a key input", () => {
  expect(
    secretFor(
      "      with:\n          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n",
    ),
  ).toEqual({ provider: "claude-code", secret: "CLAUDE_CODE_OAUTH_TOKEN" });
  expect(
    secretFor("    with:\n      anthropic-api-key: ${{secrets.MY_KEY}}\n"),
  ).toEqual({ provider: "anthropic", secret: "MY_KEY" });
  // Several: the order a run picks keys in, not the order in the file.
  expect(
    secretFor(
      "  xai-api-key: ${{ secrets.XAI }}\n  google-api-key: ${{ secrets.G }}\n",
    ),
  ).toEqual({ provider: "google", secret: "G" });
});

test("an unreadable workflow names the secret every example uses", () => {
  expect(secretFor(null)).toEqual({
    provider: "claude-code",
    secret: "CLAUDE_CODE_OAUTH_TOKEN",
  });
  expect(secretFor("  claude-code-oauth-token: ${{ env.T }}\n")).toMatchObject({
    secret: "CLAUDE_CODE_OAUTH_TOKEN",
  });
});

test("the workflow path comes out of GITHUB_WORKFLOW_REF", () => {
  expect(
    workflowPath(
      "acme/widgets/.github/workflows/explain.yml@refs/pull/2/merge",
      "acme/widgets",
    ),
  ).toBe(".github/workflows/explain.yml");
  expect(workflowPath("", "acme/widgets")).toBe("");
});

test("the note is one line naming the secret, how to make it, and where", () => {
  const body = setupComment({
    provider: "claude-code",
    secret: "CLAUDE_CODE_OAUTH_TOKEN",
    repo: "acme/widgets",
    runId: "42",
  });
  const [marker, note, ...rest] = body.split("\n");
  expect(marker).toBe("<!-- release-explainer: setup -->");
  expect(rest).toEqual([]);
  expect(note).toBe(
    "**No explainer yet: the `CLAUDE_CODE_OAUTH_TOKEN` secret is not set.** A maintainer can run `claude setup-token`, save what it prints as `CLAUDE_CODE_OAUTH_TOKEN` under [Settings → Secrets and variables → Actions](https://github.com/acme/widgets/settings/secrets/actions/new), then [re-run this job](https://github.com/acme/widgets/actions/runs/42).",
  );
  expect(
    setupComment({ provider: "openai", secret: "OAI", repo: "a/b" }),
  ).toContain("can save an OpenAI API key as `OAI` under ");
});

test("the note replaces an earlier note or skip, never a watch link", () => {
  const link = "<!-- release-explainer -->\n---\n\n[Watch the explainer](u)";
  const note = `<!-- release-explainer -->\n${setupComment({ provider: "claude-code", secret: "T", repo: "a/b" })}`;
  expect(planComment(note, true)).toBe("update");
  expect(planComment(link, true)).toBe("keep");
  // Once the secret is set, the explainer replaces the note.
  expect(planComment(note, false)).toBe("update");
});

test("a refused secret gets the same fix, saying it was refused", () => {
  const body = setupComment({
    provider: "claude-code",
    secret: "CLAUDE_CODE_OAUTH_TOKEN",
    repo: "acme/widgets",
    refused: true,
  });
  expect(body).toStartWith("<!-- release-explainer: setup -->\n");
  expect(body).toContain(
    "**No explainer yet: the `CLAUDE_CODE_OAUTH_TOKEN` secret was refused (expired or revoked).** A maintainer can run `claude setup-token`",
  );
});
