import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAccountSettings,
  applyFallbackVoice,
  engineInstallPlan,
} from "../scripts/present.mjs";

/**
 * The bug class: narrating in a voice the owner did not pick. The Action
 * defaulted `--voice kokoro:af_heart`, which outranks the saved voice, so every
 * explainer narrated in af_heart. Precedence is `--voice` > channel > account
 * > `--fallback-voice`, and the fallback stands for "nothing saved" — so it
 * applies only once /api/me has been read and says so. An unreadable /api/me
 * stops the publish instead, or the same wrong voice comes back during an
 * outage.
 */

// The shape of @siderakis's real settings on 2026-10-04: the account voice is
// af_heart, the @siderakis channel bm_fable, @the-wire a cloud voice.
const me = {
  account: { username: "siderakis" },
  settings: {
    voiceId: "af_heart",
    engine: "kokoro",
    channelVoices: {
      siderakis: { voiceId: "bm_fable", engine: "kokoro" },
      "claude-code": { voiceId: "ono_anna", engine: "qwen3-voices-17b" },
      "the-wire": { voiceId: "xctasy8XvGp2cVO9HL9k", engine: "elevenlabs" },
    },
  },
};
const FALLBACK = { "fallback-voice": "kokoro:af_heart" };

/** applyAccountSettings then applyFallbackVoice, as publish runs them; `me`
 *  is null when /api/me could not be read. */
function resolve(flags, account = me) {
  if (account) applyAccountSettings(flags, account);
  const problem = applyFallbackVoice(flags, account);
  return { flags, problem };
}

describe("voice precedence", () => {
  test("an omitted voice takes the channel's saved voice", () => {
    const { flags, problem } = resolve({ ...FALLBACK });
    expect(problem).toBeNull();
    expect(flags.voice).toBe("kokoro:bm_fable");
    expect(flags.engine).toBe("kokoro");
  });

  test("a channel's Studio voice outranks the account's Kokoro one", () => {
    const { flags } = resolve({ ...FALLBACK, handle: "claude-code" });
    expect(flags.voice).toBe("qwen3-voices-17b:ono_anna");
    expect(flags.engine).toBe("qwen3-voices-17b");
  });

  test("an explicit --voice outranks the saved voice", () => {
    const { flags, problem } = resolve({
      ...FALLBACK,
      voice: "qwen3-voices-17b:ryan",
    });
    expect(problem).toBeNull();
    expect(flags.voice).toBe("qwen3-voices-17b:ryan");
    // The channel's engine contradicts the explicit voice, so it is dropped.
    expect(flags.engine).toBeUndefined();
  });

  test("an omitted voice on a channel with none takes the account's", () => {
    const { flags } = resolve({ ...FALLBACK, handle: "elsewhere" });
    expect(flags.voice).toBe("kokoro:af_heart");
  });

  test("a saved engine with no voice id is not overridden by the fallback", () => {
    // A clone engine names its voice later, from this machine's clone.
    const { flags, problem } = resolve(
      { ...FALLBACK },
      { account: { username: "a" }, settings: { engine: "qwen3-clone-17b" } },
    );
    expect(problem).toBeNull();
    expect(flags.voice).toBeUndefined();
    expect(flags.engine).toBe("qwen3-clone-17b");
  });
});

describe("the fallback voice", () => {
  test("applies after a successful read that found no saved voice", () => {
    for (const settings of [{}, undefined, { channelVoices: {} }]) {
      const { flags, problem } = resolve(
        { ...FALLBACK },
        { account: { username: "new" }, settings },
      );
      expect(problem).toBeNull();
      expect(flags.voice).toBe("kokoro:af_heart");
    }
  });

  test("does not apply when /api/me could not be read", () => {
    const { flags, problem } = resolve({ ...FALLBACK }, null);
    expect(flags.voice).toBeUndefined();
    expect(problem).toMatch(/could not read this account's saved voice/);
    expect(problem).toMatch(/--voice/);
  });

  test("an explicit --voice still publishes when /api/me could not be read", () => {
    const { flags, problem } = resolve(
      { ...FALLBACK, voice: "kokoro:am_michael" },
      null,
    );
    expect(problem).toBeNull();
    expect(flags.voice).toBe("kokoro:am_michael");
  });

  test("does not stand in for a saved voice this machine cannot speak", () => {
    const { flags, problem } = resolve({ ...FALLBACK, handle: "the-wire" });
    expect(flags.voice).toBeUndefined();
    expect(problem).toMatch(/@the-wire has a saved voice/);
  });

  test("is inert without --fallback-voice, as the skill runs locally", () => {
    expect(resolve({}, null).problem).toBeNull();
    expect(resolve({ handle: "the-wire" }).problem).toBeNull();
  });
});

describe("the resolved voice's engine is installed on a fresh runner", () => {
  const fresh = [
    { id: "kokoro", installed: false, downloadBytes: 337000000 },
    { id: "qwen3-voices-17b", installed: false, downloadBytes: 2334000000 },
  ];
  const engineOf = (flags) => flags.engine ?? flags.voice.split(":")[0];

  test("the channel's Kokoro voice installs Kokoro, once", () => {
    const { flags } = resolve({ ...FALLBACK });
    const plan = engineInstallPlan(fresh, engineOf(flags));
    expect(plan.action).toBe("install");
    expect(plan.spec.downloadBytes).toBe(337000000);
    // A cache restore lands on an installed engine: nothing is downloaded.
    const cached = fresh.map((e) => ({ ...e, installed: true }));
    expect(engineInstallPlan(cached, engineOf(flags)).action).toBe("none");
  });

  test("the fallback voice installs Kokoro too", () => {
    const { flags } = resolve(
      { ...FALLBACK },
      { account: { username: "new" }, settings: {} },
    );
    expect(engineInstallPlan(fresh, engineOf(flags)).action).toBe("install");
  });
});

/** A stand-in bisque.cloud: `answer` replies to each request, and every
 *  request is recorded with its JSON body. */
async function withServer(answer, fn) {
  const seen = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const text = await req.text();
      const call = {
        route: `${req.method} ${new URL(req.url).pathname}`,
        body: text ? JSON.parse(text) : undefined,
      };
      seen.push(call);
      return answer(call);
    },
  });
  try {
    return await fn(`http://localhost:${server.port}`, seen);
  } finally {
    server.stop(true);
  }
}

const PRESENTATION = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="presentation-format" content="html-presentation/v1" /><title>T</title></head>
<body><div class="slides"><section id="a">
<div data-layout="landscape"><h2>Hi</h2></div><div data-layout="vertical"><h2>Hi</h2></div>
<aside class="notes">Revenue grew three times.</aside></section></div></body></html>`;

/** `present.mjs publish` in a fresh directory, against `base`. Async: a sync
 *  spawn would block this process, and the server with it. */
async function publish(base, extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "present-voice-"));
  fs.writeFileSync(path.join(dir, "index.html"), PRESENTATION);
  const proc = Bun.spawn(
    [
      "node",
      fileURLToPath(new URL("../scripts/present.mjs", import.meta.url)),
      "publish",
      "--html",
      "index.html",
      ...extra,
    ],
    {
      cwd: dir,
      env: {
        ...process.env,
        HOME: dir,
        BISQUE_BASE_URL: base,
        BISQUE_API_KEY: "test-key",
        BISQUE_USER_ID: "test-user",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stderr = await new Response(proc.stderr).text();
  return { dir, stderr, exitCode: await proc.exited };
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("publish during an outage stops before narrating or uploading", async () => {
  await withServer(
    () => new Response("unavailable", { status: 503 }),
    async (base, seen) => {
      const r = await publish(base, ["--fallback-voice", "kokoro:af_heart"]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/could not read this account's saved voice/);
      expect(r.stderr).not.toMatch(/fallback — none passed or saved/);
      // Only the settings read went out: nothing was created or uploaded.
      expect(seen.map((c) => c.route)).toEqual(["GET /api/me"]);
      expect(fs.existsSync(path.join(r.dir, "audio"))).toBe(false);
    },
  );
});

describe("the create names the voice it will narrate in", () => {
  /** /api/me answers with `me`; the create is refused so nothing runs past
   *  it, and its body is what these check. */
  const stopAtCreate = ({ route }) =>
    route === "GET /api/me"
      ? json(200, me)
      : json(400, { error: { code: "STOP", message: "test stops here" } });

  async function createBody(extra) {
    return withServer(stopAtCreate, async (base, seen) => {
      const r = await publish(base, extra);
      const create = seen.find((c) => c.route === "POST /v1/presentations");
      expect(create).toBeDefined();
      expect(r.exitCode).not.toBe(0);
      return create.body;
    });
  }

  test("the saved channel voice, so stored audio in another is not reused", async () => {
    const body = await createBody(["--fallback-voice", "kokoro:af_heart"]);
    expect(body.narrationVoice).toBe("kokoro:bm_fable");
    expect(body.voiceId).toBe("kokoro:bm_fable");
    expect(body.reuseAudio).toBeUndefined();
  });

  test("a Studio voice the server cannot render is still named", async () => {
    const body = await createBody(["--voice", "qwen3-voices-17b:ryan"]);
    expect(body.narrationVoice).toBe("qwen3-voices-17b:ryan");
    expect(body.voiceId).toBeUndefined();
  });

  // The server carries a slide only when its recorded voice equals this one
  // exactly, so a bare id has to arrive qualified, or every publish would
  // narrate every slide again.
  test("a bare Kokoro --voice is named with its engine", async () => {
    const body = await createBody(["--voice", "af_heart"]);
    expect(body.narrationVoice).toBe("kokoro:af_heart");
  });

  test("a bare Studio speaker is named with its engine", async () => {
    const body = await createBody([
      "--voice",
      "ryan",
      "--engine",
      "qwen3-voices-17b",
    ]);
    expect(body.narrationVoice).toBe("qwen3-voices-17b:ryan");
  });

  test("--all asks the server to carry nothing forward", async () => {
    const body = await createBody(["--all"]);
    expect(body.reuseAudio).toBe(false);
  });
});

describe("engineInstallPlan", () => {
  const engines = [
    { id: "kokoro", installed: true, downloadBytes: 337000000 },
    { id: "qwen3-voices-17b", installed: false, downloadBytes: 2334000000 },
    {
      id: "qwen3-clone-06b",
      installed: false,
      unsupported: { code: "platform-unsupported", message: "…" },
    },
  ];

  test("a cached engine is not downloaded again", () => {
    expect(engineInstallPlan(engines, "kokoro").action).toBe("none");
  });

  test("a missing engine is installed, whatever its family", () => {
    const plan = engineInstallPlan(engines, "qwen3-voices-17b");
    expect(plan.action).toBe("install");
    expect(plan.spec.downloadBytes).toBe(2334000000);
    expect(
      engineInstallPlan(
        [{ id: "kokoro", installed: false, downloadBytes: 337000000 }],
        "kokoro",
      ).action,
    ).toBe("install");
  });

  test("an engine this build cannot run is left for synthesis to report", () => {
    expect(engineInstallPlan(engines, "qwen3-clone-06b").action).toBe(
      "unsupported",
    );
  });

  test("an engine bisque-voice does not list, or none at all", () => {
    expect(engineInstallPlan(engines, "vibevoice-7b").action).toBe("unknown");
    expect(engineInstallPlan(engines, null).action).toBe("none");
    expect(engineInstallPlan(undefined, "kokoro").action).toBe("unknown");
  });
});

test("the publish example in SKILL.md pins no voice", () => {
  // An agent copies this block; a --voice in it outranks the saved voice.
  const skill = fs.readFileSync(
    new URL("../SKILL.md", import.meta.url),
    "utf8",
  );
  const section = skill.slice(skill.indexOf("## 4. Publish"));
  const example = /```sh\n([\s\S]*?)```/.exec(section);
  expect(example).not.toBeNull();
  expect(example[1]).not.toContain("--voice");
});

describe("a repository publishing with its GitHub identity", () => {
  // No Bisque account means no saved voice to honor, so the fallback is the
  // voice, without the /api/me read an account publish waits on.
  test("narrates in the fallback voice", () => {
    const flags = { "fallback-voice": "kokoro:af_heart" };
    expect(applyFallbackVoice(flags, null, { accountless: true })).toBeNull();
    expect(flags.voice).toBe("kokoro:af_heart");
  });

  test("an account whose /api/me failed still stops", () => {
    const flags = { "fallback-voice": "kokoro:af_heart" };
    expect(applyFallbackVoice(flags, null)).toContain("could not read");
  });
});
