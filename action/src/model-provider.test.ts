import { describe, expect, test } from "bun:test";
import {
  keysFromEnv,
  PROVIDERS,
  providerOf,
  resolveRun,
  specFor,
} from "./model-provider.ts";

describe("resolveRun", () => {
  test("one key is enough: it picks that provider's default model", () => {
    const r = resolveRun({ anthropic: "sk-a" });
    expect(r).toEqual({
      provider: "anthropic",
      model: "anthropic/claude-opus-5",
      variant: "medium",
      key: "sk-a",
    });
  });

  test("each provider has a default that names itself", () => {
    for (const [p, spec] of PROVIDERS) {
      const r = resolveRun({ [p]: "k" });
      expect(r).toMatchObject({
        provider: p,
        model: `${p}/${spec.defaultModel}`,
      });
    }
  });

  test("several keys resolve by the documented order, not alphabetically", () => {
    expect(resolveRun({ xai: "k", google: "k", anthropic: "k" })).toMatchObject(
      { provider: "anthropic" },
    );
    expect(resolveRun({ xai: "k", google: "k" })).toMatchObject({
      provider: "google",
    });
  });

  test("no key names every input it accepts", () => {
    const r = resolveRun({});
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain(
      "claude-code-oauth-token, anthropic-api-key, openai-api-key, google-api-key, xai-api-key",
    );
  });

  test("blank and whitespace keys count as absent", () => {
    expect(resolveRun({ anthropic: "", openai: "   " })).toHaveProperty(
      "error",
    );
    expect(resolveRun({ anthropic: "", openai: "sk-o" })).toMatchObject({
      provider: "openai",
    });
  });

  test("an explicit model wins over the default", () => {
    expect(
      resolveRun({ anthropic: "k" }, "anthropic/claude-sonnet-4-6"),
    ).toMatchObject({
      model: "anthropic/claude-sonnet-4-6",
      variant: "medium",
    });
  });

  test("an explicit variant wins over the provider's default", () => {
    expect(resolveRun({ anthropic: "k" }, "", "high")).toMatchObject({
      variant: "high",
    });
  });

  test("a model whose provider has no key says which key is missing", () => {
    const r = resolveRun({ anthropic: "k" }, "openai/gpt-5.6-sol");
    expect((r as { error: string }).error).toContain("openai-api-key is empty");
  });

  test("a model without a provider prefix is refused with an example", () => {
    const r = resolveRun({ anthropic: "k" }, "claude-opus-5");
    expect((r as { error: string }).error).toContain("provider/model");
  });

  test("an unroutable provider names the supported ones", () => {
    const r = resolveRun({ anthropic: "k" }, "mistral/large");
    expect((r as { error: string }).error).toContain(
      "anthropic, openai, google, xai",
    );
  });
});

describe("specFor", () => {
  test("the base path is the SDK's prefix, so the proxy never doubles it", () => {
    expect(specFor("openai").basePath).toBe("/v1");
    expect(specFor("anthropic").basePath).toBe("");
    expect(specFor("google").basePath).toBe("/v1beta");
  });

  test("auth style matches each provider", () => {
    expect(specFor("anthropic").header).toBe("x-api-key");
    expect(specFor("openai").prefix).toBe("Bearer ");
    expect(specFor("google").header).toBe("x-goog-api-key");
  });

  test("an unknown provider throws with the supported list", () => {
    expect(() => specFor("mistral")).toThrow(/anthropic, openai, google, xai/);
  });
});

test("providerOf takes the provider half of a models.dev id", () => {
  expect(providerOf("anthropic/claude-opus-5")).toBe("anthropic");
});

test("keysFromEnv reads every key input", () => {
  expect(keysFromEnv({ GOOGLE_API_KEY: "g" })).toEqual({
    "claude-code": "",
    anthropic: "",
    openai: "",
    google: "g",
    xai: "",
  });
});

describe("a Claude subscription", () => {
  test("runs Claude Code on the plan's default model", () => {
    expect(resolveRun({ "claude-code": "sk-ant-oat01-x" })).toEqual({
      provider: "claude-code",
      model: "claude-code/default",
      variant: "",
      key: "sk-ant-oat01-x",
    });
    expect(specFor("claude-code")).toMatchObject({
      engine: "claude-code",
      header: "authorization",
      prefix: "Bearer ",
    });
  });

  test("comes before an API key when both are set", () => {
    expect(
      resolveRun({ anthropic: "sk-a", "claude-code": "sk-ant-oat01-x" }),
    ).toMatchObject({ provider: "claude-code" });
  });

  test("an anthropic/ model with only the subscription runs on it", () => {
    expect(
      resolveRun({ "claude-code": "t" }, "anthropic/claude-sonnet-5"),
    ).toMatchObject({
      provider: "claude-code",
      model: "claude-code/claude-sonnet-5",
    });
  });

  test("reads CLAUDE_CODE_OAUTH_TOKEN from the step environment", () => {
    expect(keysFromEnv({ CLAUDE_CODE_OAUTH_TOKEN: "t" })["claude-code"]).toBe(
      "t",
    );
  });
});
