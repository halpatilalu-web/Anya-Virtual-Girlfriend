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
| Photos | `puter.ai.txt2img(prompt, testMode, options)` |

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

### Her name

Tap the header name to open **Her name & face**. Any name works — that is the
whole feature — and it is stored as `memory.gName` (the storage key predates the
rename). It flows into the persona prompt, the header, photo captions, the
greeting and the download filename. Empty names are refused and long ones are
capped at 24 characters so the header cannot be blown out.

### Face lock

Every photo used to be a fresh roll of the dice: same words in the prompt, but a
different woman each time. **Face lock photo** fixes that.

Pick a clear front photo and `readIdentityFile()` shrinks it to a 640 px JPEG data
URL. That data URL is stored in memory and passed to every generation as
`input_image`, which Puter forwards to the provider as a real image-to-image
reference — the part that actually anchors a face.

Two halves are kept strictly apart in `buildImagePrompt()`:

| Fixed (identity) | Free (scene) |
| --- | --- |
| `IDENTITY_LOOK` — hair, eyes, nose, face shape, skin, dimple | pose, expression, outfit, location, lighting |

The identity half is byte-identical on every call; only the scene comes from the
message. That is also asserted in the tests, because drift here is invisible until
the photos stop looking like the same person.

Limits worth knowing:

- **Provider-dependent.** `input_image` is documented for every Puter image
  provider, but *how closely* a model follows a reference varies — which is
  exactly why Seedream 5.0 Pro is the default. Text-to-image-only models reject
  references outright.
- **Storage is per browser.** The reference lives in `localStorage`, so it is not
  synced across devices and "Forget all" is the only wipe.
- **A Drive folder cannot be read by the app.** Google Drive needs OAuth and a
  server; the photo has to be picked from the device (or downloaded first).

### Saving photos

Every generated photo gets a **⬇ Save photo** link with a `download` attribute,
named after her (`ananya-das-1712…jpg`). Without it the only desktop route was
right-click → Save image, which most people never find.

### Instagram-style chat

Bubbles follow DM conventions rather than a glass-card look: one flat colour per
sender, a 22 px radius, and only the corner nearest the sender clipped. Photos get
a caption line and an action row underneath, the way a DM attachment does.

### Songs, shayari and verses

She can sing — with the actual lyrics — and she can carry a whole conversation
about music, not just quote one line and change the subject. The persona prompt
covers film songs (old and new), ghazals, qawwali, bhajans, aartis, shlokas,
Hanuman Chalisa, Kabir ke dohe, Amritwani, Ramayan/Mahabharat katha, lullabies,
motivational speech, shayari and muhavare.

Three deliberate rules in that block:

- **Sing in quotes.** Lyrics go inside `"..."`, which lets the UI style them as
  verse and lets the voice note slow down at the line breaks.
- **Flirt *inside* the song.** She plays with a line as she sings it, best-friend
  style, instead of reading the lyrics out like a search result.
- **Never invent a famous verse.** If she is not sure of the words she says so and
  offers a couplet she does know — a fabricated Hanuman Chalisa line is worse
  than an honest "poora yaad nahi".

Quoted spans are rendered as their own `.verse` block, built from text nodes only
(`renderTextWithVerse`), so a model reply containing `<img onerror=...>` stays
literal text.

### Voice notes

Asking for a voice note — *"voice note bhejo"*, *"awaaz me sunao"*, *"sing karke
bhejo"*, *"bol ke batao"* — makes `VOICE_NOTE_RE` flag the turn. After the text
reply is on screen, `sendVoiceNote()` synthesises the same words and drops an
`<audio controls>` bubble into the chat, so it can be kept and replayed without
pressing ▶.

`buildVoiceNoteSpeech()` stretches the pause to **650 ms** when the reply contains
quoted verse, so a song lands line by line instead of as one rush. Text is
truncated to `VOICE_NOTE_MAX_CHARS` (2800) — Polly's hard limit is 3000
characters and a long song would otherwise fail with `input_too_large`. A failed
voice note never removes the text reply.

### Error messages are source-aware

`reportError(error, source)` now separates `'chat'` from `'voice'`. Previously
every failure — including a blocked autoplay — was reported with the chat copy
*"yeh message samajh nahi aaya"*, which is why pressing ▶ looked like she had not
understood the message at all. Voice failures now say what actually went wrong
(blocked playback, service down, text too long) and the replay cache stores the
exact string that was sent, SSML included, so a replay reuses the same clip.

### Voice fallback chain

Pressing play used to end at *"Awaaz set nahi ho payi"* whenever the SSML request
was rejected, because there was exactly one route to audio and no retry.

`synthesiseSpeech()` now tries up to three routes in order and returns the first
clip that comes back:

| Route | Why | Trade |
| --- | --- | --- |
| Polly + SSML | Best prosody — tone, pitch, verse breaks | Most fragile; a `bad_request` here used to kill the feature |
| Polly, plain text | Same Indian English voice, nothing for the markup layer to reject | Loses tone shaping |
| OpenAI `gpt-4o-mini-tts`, `instructions` | Different provider entirely, so a Polly outage is survivable | Loses the `en-IN` accent |

The URL that actually worked is what gets cached, so a replay is free even when
the SSML attempt had to be skipped. Failures are logged per attempt and reported
once — a repeated outage no longer prints the same line on every bubble *and*
every retry.

The persona also had to be corrected. She was telling users *"main voice note
actually send nahi kar sakti"* — which is false, and which makes the app look
broken from the inside. The prompt now states that everything she writes is
spoken aloud, that a voice note is sent automatically, and that claiming
otherwise breaks the app.

### Reactions

Every reply carries a small ❤️ 😂 🥺 row. Picking one stores it in memory and the
next turn's prompt tells her about it, so she notices. A second choice replaces
the first rather than accumulating — it is a reaction, not a tally.

### A CSS gotcha worth knowing

`index.html` declares `[hidden] { display: none !important; }` in the author
stylesheet. That rule is **not optional**.

The browser's own `[hidden] { display: none }` has lower precedence than *any*
author rule that sets `display`. `.onboarding` sets `display: flex`, so with only
the UA rule the overlay stayed on screen forever — clicking **Skip** set the
attribute correctly but changed nothing visually, and the app was unusable past
the first screen.

jsdom cannot compute this cascade, so the regression tests assert on the CSS text
directly (rule exists, and it carries `!important`).

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
| `freeImageUrl()` | Builds the free Pollinations request. `FREE_IMAGE_COOLDOWN_MS` (45 s) and `FREE_IMAGE_TIMEOUT_MS` live next to it. |
| `IMAGE_OPTIONS` | Paid route only. Seedream 5.0 Pro at 1K. Swap in `gpt-image-2` (~7x cheaper) or `flux-schnell` to cut the bill. |
| `IMAGE_FALLBACK_OPTIONS` | One retry route if the configured model or tier is rejected. |
| `IMAGE_PROMPT_PREFIX` | The fixed identity description prepended to every photo prompt. Built from `IDENTITY_LOOK`. |
| `IDENTITY_LOOK` | The words that describe her face. Change these to change how she looks when no reference photo is locked. |
| `SYSTEM_PROMPT_TEMPLATE` | Her persona and language instructions. `${NAME}` is replaced with the chosen name per turn. |
| `DEFAULT_NAME` | `'Priya'` — used until the user renames her. |
| `IDENTITY_MAX_EDGE` | Longest edge kept for the locked face (640 px). |
| `MAX_HISTORY_TURNS` | How many past exchanges are replayed to the model (default 5). |

### State

The conversation is kept in `sessionStorage` under `priya.chat.v1`, so a refresh
keeps it, a new tab starts fresh, and **Forget all** wipes both the transcript and
the stored copy. Durable state — including her name and the locked face — lives in
`localStorage` under `priya.memory.v1`. Nothing is sent anywhere except to Puter as model context.

Storage access is wrapped in `try/catch`: private mode, a sandboxed iframe or a
full quota degrade to "no persistence" instead of breaking the chat.

### Limits to know about

- Free-tier AI rate limit is **30 requests / 10 s** and **3 concurrent**; guests
  get less. The UI disables input while a request is in flight to stay well under it.
- History is capped at the last 5 exchanges (`MAX_HISTORY_TURNS`).

### Free images (default)

The app ships **free by default**. Nothing is charged, no account is needed and
no card is asked for: [Pollinations' Classic
API](https://github.com/pollinations/pollinations/blob/master/APIDOCS.md) is
documented as *"Free · no signup · rate-limited"* and takes the prompt in the URL.

The trade-offs are real, so the UI states them instead of hiding them:

| Limit | What it means here |
| --- | --- |
| One image at a time, **≥45 s apart per IP** | A second request gets `402`. `freeImageWaitMs()` respects the cooldown, and the message says how many seconds to wait |
| One model, max **768×768** | Fine for a chat bubble; not for a wallpaper |
| Small **Pollinations logo** on every image | `nologo=true` is sent, but the docs say the logo stays on the free tier |
| **No input images** | The locked face **cannot** be used. That is why locking a face flips the app to `Photos: Paid` rather than silently ignoring the lock |
| Best effort | No uptime guarantee, so a failure falls through to the paid route |

`private=true` is sent on every request: by default this endpoint can publish
generated images to a public feed, and a private photo of her should never end up
there.

The header **Photos: Free / Paid** pill switches routes. Free is the default; Paid
is only needed for the locked face (or if you simply want Seedream's quality).

### Image cost

**There is no free image model on Puter.** Every generation is billed to the
signed-in user's monthly allowance at the model's real rate. Chat is where the
free allowance goes furthest; images are the expensive part.

| Model | Approx. cost / image | Notes |
| --- | --- | --- |
| `dola-seedream-5-0-pro` via BytePlus (**paid route**) | ~$0.045 at 1K, ~$0.09 at 2K | Best face consistency. The only route that accepts a reference photo |
| `gpt-image-2` | ~$0.0059 | ~7x cheaper, noticeably looser at keeping one face |
| `black-forest-labs/flux-schnell` | ~$0.003 | Cloudflare route always returns `1024x1024`, so the portrait framing is lost |

The default route is the **free Pollinations endpoint, which costs nothing**.
Seedream is opt-in (`Photos: Paid`) because it costs ~7x more than `gpt-image-2`
and is the only route that makes a locked face hold. If you never lock a face,
you never pay anything.

`quality: '1K'` is pinned in `IMAGE_OPTIONS` (Pro's cheapest tier) along with an
explicit `provider` and `model`, and a test enforces all three — an upstream
default change cannot silently move the price to 2K or to a different model.
`IMAGE_FALLBACK_OPTIONS` gives one retry on the generic route if the model or
tier is rejected, so a retired model still returns a photo.

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
npm test           # 115 tests: intent detection, chat, images, XSS, errors, persistence, server
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
