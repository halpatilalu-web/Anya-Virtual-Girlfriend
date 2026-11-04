# Anya — Virtual Girlfriend (Priya)

A single-page AI companion chat: **Priya** replies in Hinglish and can generate
photos of herself on request.

Priya is an **adults-only romantic girlfriend**. She has a mood, opinions and a
life of her own, she texts like a person, and she is comfortable talking about
intimacy — consent, contraception, sexual health, the awkward things worth
asking — without shame. What she will not do is explicit roleplay, and she says
so up front rather than promising it and failing.

Plain HTML/CSS/JS — no build step, no `npm install`, no API key.

## Run it

The page **must be served over HTTP**. Opening `index.html` directly as a
`file://` URL will not work, because the Puter SDK needs a real origin.

```bash
npm start          # http://localhost:8000  (no dependencies needed)
```

The built-in `scripts/serve.js` is a zero-dependency static server that binds
`0.0.0.0` and only exposes `index.html`, `app.js` and `README.md`. Any other
static server works too (`python3 -m http.server 8000`, `npx serve`, ...).

## How it works

Both text and images go through [Puter.js](https://developer.puter.com), which
requires no API key and no backend:

| Feature | Call |
| --- | --- |
| Chat replies | `puter.ai.chat(messages, { model })` |
| Spoken replies | `puter.ai.txt2speech(text, VOICE_OPTIONS)` |
| Photos | `puter.ai.txt2img(prompt, options)` |

### Memory

Priya remembers you between visits. Memory lives in `localStorage` under
`priya.memory.v1` — deliberately **separate** from the transcript, which stays in
`sessionStorage` and dies with the tab.

She decides what to remember. The system prompt asks her to append directives to
her own reply:

```
[[remember: He is an engineering student]]
[[mood: sulky]]
```

`extractMarkers()` strips these before anything reaches the screen, stores the
fact, and updates her mood. A malformed or unknown directive is dropped rather
than rendered — tests cover both, because a leaked `[[remember: ...]]` would look
broken.

Memory is capped at 40 facts, de-duplicated case-insensitively, and replayable
into the next prompt. **Tap her name** in the header to open the *She remembers*
panel: it lists every stored fact, lets you delete one at a time, and has a
**Forget all** that wipes memory *and* transcript. That transparency is
deliberate — you should always be able to see and delete what an app knows
about you.

Storage access is wrapped in `try/catch`: private mode, a sandboxed iframe or a
full quota degrade to "no persistence" instead of breaking chat.

### Personality & continuity

| Feature | Detail |
| --- | --- |
| Onboarding | First run asks for your name and what you do, then saves both as memory |
| Time awareness | Date, time, part of day and timezone are injected each turn, so she reacts to a 2am message differently from a 9am one |
| Days together | `Day N` in the header; the prompt knows the relationship length |
| Away greeting | Return after 3+ hours and she greets you with the gap ("6 ghante baad aaye ho") |
| Mood | A persistent mood (`warm`, `happy`, `missing`, `sulky`) she can change herself |
| Idle nudge | After 20 minutes of silence she sends one message — once per idle period, never while a request is in flight or the tab is hidden |
| Typing delay | Replies are held 0.5–2.5s based on length, so they land at a human pace (skipped when streaming) |
| Streaming | Tokens are painted as they arrive with a blinking caret; the typing spinner disappears on the first chunk |
| Spontaneous selfies | She sometimes sends a photo unprompted, driven by a `[[selfie]]` marker |

### Expressive voice

Replies are not read in one flat tone. `detectTone()` reads the reply's own shape
— emoji and exclamation marks lean **excited**, ellipses and sad emoji lean
**tender** — and the text is wrapped in SSML so Polly speaks it at a matching
pace and pitch:

```xml
<speak><prosody rate="92%" pitch="-2%">Tumhari yaad aa rahi thi…</prosody></speak>
```

Two details matter:

- **Polly is kept on purpose.** OpenAI's TTS has an `instructions` parameter that
  would be more expressive, but it has no `en-IN` voice, and the Indian English
  locale is what makes Hinglish sound right. Tone control was worth less than
  the accent. `EXPRESSIVE_VOICE = false` falls back to plain text.
- **Text is XML-escaped.** A stray `&` or `<` in a reply would otherwise produce
  invalid SSML and fail the whole utterance.

Tone detection is local string matching, so it costs nothing extra.

### Reactions

Every reply carries a small ❤️ 😂 🥺 row. Picking one stores it in memory and the
next turn's prompt tells her about it, so she notices. A second choice replaces
the first rather than accumulating — it is a reaction, not a tally.

### Streaming

`chat(..., { stream: true })` returns an async iterable of chunks. Only
`type: 'text'` chunks are painted; reasoning and usage chunks are ignored. The
partial-marker problem is the subtle part: a `[[remember: ...]]` directive can
arrive split across chunks, so `render()` runs the marker stripper on every
paint. Without that, `[[remem` flashes on screen.

Three fallbacks keep this safe:

- streaming throws → a single non-streaming request is made instead
- the stream yields no text → same fallback
- the stream dies mid-reply → the partial text is kept rather than discarded

### Spontaneous selfies

The model can append a `[[selfie]]` marker when a photo would feel natural. It is
gated by `SELFIE_COOLDOWN_TURNS` (default 4 assistant turns) so she cannot flood
the chat with paid image generations, and a failed selfie is swallowed silently —
nobody should get an error message for a photo they never asked for.

### Voice

Replies are read aloud by default. **Voice: On/Off** in the header toggles it, and
every bubble has a small ▶ button to replay just that message.

`VOICE_OPTIONS` uses AWS Polly with `language: 'en-IN'`, `voice: 'Kajal'` and
`engine: 'neural'`. The Indian English locale matters: with `en-US`, model names
and Hindi words come out mangled in a foreign accent. `neural` is noticeably more
natural than the default `standard` engine.

Audio costs the same monthly allowance as everything else, so the most recent
reply's audio URL is cached — pressing ▶ on it again replays for free.

### Photos

**Photo: Normal / Styled** in the header switches the prompt style for the next
photo only. Normal is a plain portrait. Styled adds a fashion-editorial prompt
(golden-hour light, 85mm lens, professional colour grade).

Both are ordinary non-explicit portraits, and a test asserts the prompt never
contains explicit terms.

Puter uses a **User-Pays** model: each visitor covers their own usage out of the
free monthly allowance on their own Puter account. Nothing is billed to the
repository owner, and nothing needs to be provisioned.

### Configuration

Everything tunable lives at the top of `app.js`:

| Constant | Purpose |
| --- | --- |
| `CHAT_MODEL` | Any model id from the [AI model directory](https://developer.puter.com/ai/models/). Defaults to `gpt-5.4-nano`. |
| `IMAGE_OPTIONS` | Passed to `txt2img()`. Add `model: 'black-forest-labs/flux-schnell'` for a much cheaper image. |
| `IMAGE_PROMPT_PREFIX` | The fixed character description prepended to every photo prompt. |
| `SYSTEM_PROMPT` | Priya's persona and language instructions. |
| `MAX_HISTORY_TURNS` | How many past exchanges are replayed to the model (default 5). |

### State

The conversation is kept in `sessionStorage` under `priya.chat.v1`, so a refresh
keeps it, a new tab starts fresh, and **Clear** wipes both the transcript and the
stored copy. Nothing is sent anywhere except to Puter as model context.

Storage access is wrapped in `try/catch`: private mode, a sandboxed iframe or a
full quota degrade to "no persistence" instead of breaking the chat.

### Limits to know about

- Free-tier AI rate limit is **30 requests / 10 s** and **3 concurrent**; guests
  get less. The UI disables input while a request is in flight to stay well under it.
- History is capped at the last 5 exchanges (`MAX_HISTORY_TURNS`).

### Image cost

**There is no free image model on Puter.** Every generation is billed to the
signed-in user's monthly allowance at the model's real rate. Chat is where the
free allowance goes furthest; images are the expensive part.

| Model | Approx. cost / image | Notes |
| --- | --- | --- |
| `gpt-image-2` (default) | ~$0.0059 | Cheapest option measured; keeps `512x768` framing |
| `black-forest-labs/flux-schnell` | ~$0.003 | Cloudflare route always returns `1024x1024`, so the portrait framing is lost |

`quality: 'low'` is pinned in `IMAGE_OPTIONS`. It is already `gpt-image-2`'s
default, but pinning it means a change to the upstream default cannot silently
raise what users are charged. A test enforces the pin.

For development, flip `TEST_MODE` in `app.js` to `true`. It calls
`txt2img(prompt, true)`, which returns a sample image and **charges nothing** —
the only genuinely zero-cost path. A test asserts it is `false` so it cannot
ship enabled by accident.

Prices move; check the [model directory](https://developer.puter.com/ai/models/)
and [rate limits and quotas](https://docs.puter.com/rate-limits-and-quotas/).

## Deploy

The app is static — any host that serves files over HTTP works. It **cannot** be
opened as a `file://` URL, because Puter.js needs a real origin.

### GitHub Pages

1. **Settings -> Pages**
2. Source: **Deploy from a branch**
3. Branch: **`main`**, folder: **`/` (root)** -> **Save**

Live at `https://<user>.github.io/<repo>/` within a minute or two.

Two things to know before enabling it:

- **The repo must be public.** GitHub Pages on a private repo needs a paid plan.
- **Pages serves the whole branch root**, so `package.json`, `test/` and
  `scripts/` become publicly readable. Nothing secret is committed there, so this
  is safe — the dev server's file allowlist only protects local use, not Pages.
  To serve only the app, move `index.html` and `app.js` into `docs/` and point
  Pages at that folder instead.

The page is fully client-side; there are no environment variables or build step
to configure.

## Development

```bash
npm install        # dev-only: jsdom + css-tree for the test suite
npm run check      # CSS lint + full test suite
npm test           # 110 tests: intent detection, chat, images, XSS, errors, persistence, server
npm run lint       # validates every CSS declaration in index.html
```

`npm run lint` exists because this repo previously shipped Tailwind-style
property names (`max-w`, `border-b`, `tracking-letter`) inside a plain `<style>`
block, where every browser silently ignores them. The lint fails the build on
any invalid declaration, caught by `css-tree`'s property validator.

The same class of bug is why the dev server has an explicit allowlist rather
than serving the whole directory: only the three public files are reachable.

## Content policy

Priya is affectionate, romantic and flirty, and she discusses intimacy honestly.
She does not perform sex. The system prompt (`SYSTEM_PROMPT` in `app.js`) sets
three firm boundaries:

1. No explicit sexual roleplay, erotic scenarios or sexual narration.
2. Never any sexual content involving minors, in any framing.
3. She explains and normalises; she never diagnoses.

It also tells her to refuse **once, lightly, in character**, then stay warm and
redirect — rather than turning into a refusal machine that lectures on every
turn. (A test guards that line, because a preachy assistant is a worse product
than a warm one with limits.)

### Why not just loosen the prompt

Not a limitation to work around. Every model Puter routes to (OpenAI, Anthropic,
Google) enforces the same policy at the provider level, so a prompt that lifts
these lines simply gets blocked upstream. That is exactly the failure mode this
repo started with: the old greeting advertised *"sexy baatein"* while every
request was silently refused, so the app looked broken rather than honest.

The visible copy and the system prompt are kept aligned, and tests enforce it in
both directions — see the `persona` suite. One test fails if the greeting
promises explicit content again; another fails if the girlfriend character is
watered down into a neutral guide.

## Notes

- Generated images are AI-generated, not real photographs.
- Chat text is rendered with `textContent`, never `innerHTML`.

## License

MIT — see `LICENSE`.
