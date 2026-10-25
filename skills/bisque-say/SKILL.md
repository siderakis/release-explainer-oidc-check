---
name: bisque-say
description: Speaks text aloud and writes an audio file. Use when asked to say, speak, read, or read aloud some text, to narrate or voice a changelog, release note, doc page, commit message or block of prose, to make a voice-over or an audio version of something, or for text to speech and TTS.
---

# Bisque Say

`bisque-voice` turns text into audio on this machine. Named after macOS `say`,
except the voice is a real speech model, it runs on macOS, Linux and Windows,
and it costs nothing per word.

Use it for anything a person would rather listen to than read: a changelog, a
release note, a docs page, a long commit message, a block of prose the user
pastes in. For a presentation, use `/present` instead. This skill does
not author slides.

## 1. Check the machine

```sh
~/.bisque/bin/bisque-voice doctor
```

It prints where models live, which engines and aligners are installed, and any
cloned voices.

**No `bisque-voice`.** It lives at `~/.bisque/bin/bisque-voice`
(`%USERPROFILE%\.bisque\bin\bisque-voice.exe`), which is usually **not** on
`PATH`. Never probe with `command -v` or `where`; they report "missing" on
machines where it is installed. Tell the user what it is and that you are about
to download about 30 MB, then:

```sh
curl -fsSL https://download.bisque.today/bisque-voice/install.sh | sh   # macOS, Linux
```

```powershell
irm https://download.bisque.today/bisque-voice/install.ps1 | iex        # Windows
```

## 2. Pick an engine and a voice

There is deliberately no default engine and no default voice. The user picks.

```sh
~/.bisque/bin/bisque-voice engines --json
```

Read the real output and offer each entry's trade-offs in a sentence:
`summary`, `downloadBytes`, `languages`, `voiceCount`, `parameters`. Take voice
ids from that output and never from memory. Each entry may carry a `voices`
array with `grade` and `recommended`; "not recommended" means the voice has
audible quality issues upstream, not a licensing problem. An entry with an
`unsupported` field cannot run in this build, so relay its `message` and offer
the rest.

Suggest `kokoro:af_heart` unless the user wants something else. It is graded A,
Kokoro is the smallest and fastest engine, and it is the only one whose word
timings are exact.

```sh
~/.bisque/bin/bisque-voice install kokoro
```

`install` takes several ids at once. Say the download size before you run it.

## 3. Say it

```sh
~/.bisque/bin/bisque-voice \
  --text "Version 0.2 ships today. Exports are twice as fast." \
  --voice kokoro:af_heart \
  --align none \
  --out release.mp3
```

Then play it:

```sh
afplay release.mp3        # macOS
```

Points that bite:

- **`--out` is required.** Nothing plays by itself, and the command fails
  without it. The directory has to exist already.
- **The extension picks the format.** `.wav` writes WAV, anything else writes
  MP3. Prefer MP3 for something the user will keep or send.
- **`--align none` skips the forced aligner.** The aligner measures word
  timings, which matter for captions and cues and not for listening. Skipping
  it roughly halves the wall time. Kokoro's own timings are exact regardless.
- **Qualify the voice** as `engine:voice`. With several engines installed and a
  bare voice id, the command stops and names them.

Other flags worth knowing: `--speed` (1.0 default, higher is faster, nothing is
clamped), `--match-macos` (speed 1.3, the pace the Bisque Mac app reads at),
`--language` on a multilingual engine, `--device cpu` when the accelerator path
misbehaves, `--threads`.

It prints one line of JSON on stdout: the word timings, `durationMs`, `exact`,
`contentType`, `size` and `hash`. Tell the user the duration and where the file
is.

## 4. Fix a word the voice gets wrong

A pronunciation marker splits what a reader sees from what the voice says:

```
[live](/lˈɪv/)    IPA between slashes. Precise. Needs an engine with a
                  phoneme stage.

[live](liv)       A respelling. Works on every engine, including ones that
                  accept no phonemes at all.
```

The bracket text is the word, and it is what any transcript or caption shows.
The parenthesis is only ever spoken and never appears anywhere a person reads.

**Never respell a word in the text itself.** Writing `liv` where the user wrote
`live` fixes the audio by corrupting the document. The marker exists so you
never have to make that trade.

A respelling is engine-specific. Kokoro reads `liv` as `lˈɪv`; Qwen3 reads the
same substitute closer to _leave_. Check it on the engine you are actually
using, or use IPA, which does not have this problem.

Write the substitute the way a person says the word, with the pauses they make.
A space is a boundary the voice pauses at; a hyphen glues its pieces into one
word. `[README.md](read-me dot em-dee)` is said "readme · dot · emdee", and
`[iOS](eye-oh-ess)` is one word where `[iOS](eye oh ess)` is three. An engine
without a phoneme stage is handed the substitute as text and decides the
phrasing itself.

`--debug-tokens` prints what the engine will say, to stderr, before you commit
to generating audio:

```sh
~/.bisque/bin/bisque-voice --text "We are live now." \
  --voice kokoro:af_heart --align none --debug-tokens --out /dev/null
```

```
token "live" -> "lˈIv"          wrong, that is the "lively" reading
```

With the marker:

```
token "live" -> "lˈɪv"          right
```

This works on engines that have a phoneme stage. Kokoro does. Qwen3 does not,
and prints no tokens, so check that one by ear.

Ordinary prose holding a bracket is left alone: `an array [0] of things` reads
as itself.

## 5. Long text

`--text -` reads stdin, which is how a file gets in:

```sh
~/.bisque/bin/bisque-voice --text - --voice kokoro:af_heart \
  --align none --out changelog.mp3 < CHANGELOG.md
```

Chunking is automatic and the chunks are stitched into one file. Kokoro on a
laptop CPU synthesizes faster than the audio plays, roughly three to four times
over, so a 650-word page is about four minutes of audio and about a minute of
work. Say the estimate up front and run it in the background rather than
letting a silent terminal look like a hang.

Markdown goes in as-is. Strip the parts nobody wants read out (front matter,
tables of raw ids, code blocks) before piping, and say what you dropped.

## Rules

- **Absolute path.** `~/.bisque/bin/bisque-voice`. `command -v` is wrong here.
- **Never invent a voice id.** Every id comes from `engines --json` on this
  machine.
- **Never edit the user's text to fix a sound.** Use a pronunciation marker.
- **Read back what you are about to say** when the text came from a file. A
  changelog with 200 entries is 40 minutes of audio, and the user probably
  meant the top section.
- **This is not `/present`.** If the user wants slides, a narrated
  presentation, or something with a watch URL, hand off to that skill.
