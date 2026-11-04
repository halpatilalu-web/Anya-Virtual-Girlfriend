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
  provider, but *how closely* a model follows a reference varies. Text-to-image
  models reject references outright. `gpt-image-2`, the only route here, accepts
  one, so the lock works.
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
| `IMAGE_OPTIONS` | Puter fallback only: `gpt-image-2`, `low`, 512×768. Pinned — do not swap in an expensive model. |
| `VOICE_OPTIONS` | Polly, `hi-IN`, `Kajal`, `neural`. `hi-IN` is what makes Hindi read as Hindi. |
| `SONG_PROSODY` | Tempo and break lengths used for sung lines. |
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

### Hinglish that sounds Indian, not robotic

Replies are Hinglish written in Latin letters — `mujhe acha lagta hai`. Read with
an English engine that is *"mujhe acha lagta hai"* pronounced as English: `hai`
becomes "hi", `na` becomes "nah". That is exactly the robotic, wrong delivery that
was reported.

Kajal is a **documented fully bilingual voice** (Indian English *and* Hindi), and
[Polly's own guide](https://docs.aws.amazon.com/polly/latest/dg/bilingual-voices.html)
says a bilingual voice *"can differentiate between the languages and scripts"*,
switching mid-sentence when the text mixes Devanagari and Latin. So:

1. `toHindiScript()` rewrites the Hindi words as Devanagari (`mujhe` → `मुझे`)
   and leaves English words alone (`message` stays `message`).
2. The language code is `hi-IN`, which is what also makes numerals read in Hindi.
3. The chat still shows Hinglish — only the speech is transliterated.

Matching is word-level, so `hai` inside `chair` is untouched. The word list covers
the patterns Hinglish actually uses, not all of Hindi.

### Texting like a person, not an assistant

Two different problems, fixed in two different places.

**In the prompt.** A section on how Hindi speakers actually type: mostly
Hindi-in-Latin, English only for words that are genuinely English, uneven
message lengths (sometimes one word — `acha`, `hm`, `arre`), lowercase and no
full stop on every line, code-switching instead of translating the same thing
twice. Also: never start two replies in a row the same way.

**In code, because the prompt cannot be trusted for this.** `varyReply()` looks
at the previous reply; if the new one opens with the same stock phrase
(`Haan jaan`, `arre yaar`, `suno na`, …) it strips it — but only when a real
sentence is left behind, so a one-line `Haan jaan ❤️` survives intact. One is
warmth. Three in a row is a tic, and a tic is the loudest possible tell.

### Reading the room

Tone used to come from the reply alone — emoji and ellipses in *her* words. That
meant a cheerful answer to a sad message got a cheerful voice, which is the
opposite of comfort.

`readSituationalTone()` now reads what he wrote and what time it is:

- **Heavy words** (`udaas`, `pareshan`, `thak gaya`, `mood kharab`, …) put her in
  the close tone regardless of how the reply is punctuated, and add a prompt
  instruction: hear him first, do not cheer him up in one message.
- **Late night** (23:00–05:00) softens her unless he is clearly upbeat.
- **Upbeat words** (`khush`, `maza`, `bhaiya`, `party`, …) keep her bright.

The word lists match on boundaries, so `dilip` does not fire on `dil`. Heavy
outranks the reply's own punctuation on purpose: if the model misreads the room,
the voice should not follow it there.

### Photos follow the scene

The whole reply used to be handed to the image model as the prompt, so emoji,
`[[markers]]` and third-person narration all went with it. `sceneFromReply()`
strips markers and emoji, then keeps the first sentence that actually names a
place or a moment (`ghar`, `balcony`, `barish`, `saree`, …), capped at 140
characters. Nothing matches → no scene → a plain portrait rather than a garbled
one. The prompt now also asks her to put the place in the message when she sends
a selfie, which is what makes the drawn photo match what she just said.

### Speech polish

Found by reading the actual SSML that reaches the voice, not by guessing:

- **Em dashes and semicolons are read or swallowed.** `hi-IN` renders `—` as a
  long drag and often drops `;` entirely. Both now become a comma-pause, which
  is what a speaker does there anyway.
- **A quoted phrase is not a lyric.** Verse detection used to treat *any*
  quoted run as a song, so `tumne "kal aaungi" bola tha` dropped her into an
  84% sing-song register mid-sentence. Verse now requires a line break — inside
  the quote or between adjacent quotes — which is how a song is actually
  written and how reported speech never is.
- **Words were being glued together.** Dropping the quote characters removed the
  only separator between the prose on either side, so `tumne` + `kal` rendered
  as `tumnekal`. Segments are now joined with a space, not with emptiness.
- **Split prose/verse before normalising.** `normaliseForSpeech()` collapses
  whitespace, which erased the line breaks that identify verse. Doing it first
  turned every song into one flat sentence.
- **`आूंगी` was not a word.** A stem ending in an independent vowel (`आ`) already
  carries its vowel, so hanging the dependent sign `ू` on it produces a glyph no
  reader can parse. Such stems now take the full letter instead: `आऊंगी`.

Every one of these has a test that reads the SSML the way the voice engine will.

### Ellipses are pauses, not words

`"Haan.... phir kya hua?"` used to be spoken as **"dot dot dot dot"** — the engine
reads punctuation it does not understand. `normaliseForSpeech()` runs before
escaping and turns it into what it actually means:

| Input | Becomes |
| --- | --- |
| `...`, `....`, `…`, `..` | a real `<break>`, 380–620 ms depending on tone |
| emoji, dingbats, arrows | removed (the engine either spells or chokes on them) |
| `!!!` | one `!` |

Sentence breaks were also cut from 180–350 ms to **130–160 ms**, which is most of
the difference between "reading sentences aloud" and "talking". A single full stop
stays a sentence break; only 2+ dots become a hesitation.

### Singing

There is no melody: TTS speaks, it does not sing. What it *can* do is pace.

`splitProseAndVerse()` separates quoted lyrics from the surrounding sentence, and
`buildVersePhrase()` gives each line its own timing:

| Effect | How |
| --- | --- |
| Slower line, so it does not rush | `rate="84%"`, `pitch="+1%"` |
| A lift mid-line, like a singer taking breath | `<break time="220ms"/>` after commas |
| A real breath between lines | `<break time="700ms"/>` |
| A longer pause after the stanza | `<break time="1100ms"/>` |

Adjacent quoted lines are merged into one stanza first — otherwise every line got
a stanza pause and the song lost its flow.

The persona tells her *when* to sing (he asks, he quotes a line, the mood is soft,
a familiar line says it better than she could) and when **not** to (a serious
problem, a health question, a fight — comfort first). Most messages are not songs.

### Images: one provider, pinned cheap

Pollinations was removed. It needed a 45-second gap per IP, stamped its logo on
every image and returned worse results than the Puter model it replaced, and it
was the source of the errors that showed up in the chat.

There is now exactly one image route:

```js
const IMAGE_OPTIONS = {
    provider: 'openai',
    model: 'gpt-image-2',
    width: 512, height: 768, quality: 'low'
};
```

- **~$0.0059 per image**, the cheapest measured option on Puter.
- It accepts a reference photo, so the **face lock works** on it.
- No paid-model selector exists in the UI, and no other provider appears in
  `app.js` — nothing can move this to an expensive model by accident. Tests assert
  both.
- `IMAGE_FALLBACK_OPTIONS` retries the same prompt once with the generic options
  if the model or tier is rejected, so a rejected tier still produces a photo.

### Image cost

**There is no free image model on Puter.** Every generation is billed to the
signed-in user's monthly allowance at the model's real rate. Chat is where the
free allowance goes furthest; images are the expensive part.

| Model | Approx. cost / image | Notes |
| --- | --- | --- |
| `gpt-image-2` at `quality: 'low'` (**only Puter route**) | ~$0.0059 | The cheapest measured model, and the only route that accepts a reference photo |
| ~~`dola-seedream-5-0-pro`~~ | ~~~$0.045~~ | **Removed.** ~7x the price and one accidental selection was real money. `app.js` no longer contains the model or its provider |
| `black-forest-labs/flux-schnell` | ~$0.003 | Cloudflare route always returns `1024x1024`, so the portrait framing is lost |

One model, ~$0.006 a photo. There is no selector and no second provider, so the
price cannot change without editing `IMAGE_OPTIONS`.

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

## Guide mode (18+)

The honest answer to "adult chat": Priya can be a **sex-education companion**,
not a performer. Guide mode is a switch in the header (the **Guide** button) that
changes what she is doing in the conversation — same person, same warm Hinglish,
different job.

What it does:

- Explains bodies, contraception, STIs and consent in **ordinary Hindi/Hinglish**,
  the way a friend explains it. Ordinary words first (`safed paani`), clinical
  term in brackets once (`discharge`) if it helps him look it up.
- Correct typical-use effectiveness, not brochure numbers: condom **87% typical
  / 98% perfect** and the only method that also blocks STIs; pill 91–93%; IUD and
  implant >99%; injection 96%; withdrawal ~80%; emergency pill ~89% within 72 h,
  copper IUD within 5 days is the most effective option.
- Corrections for the myths that actually cause harm: pregnancy is possible
  during her period and the first time; there is no test for virginity; two
  condoms increase breakage rather than safety.
- **Consent**, including India's age of consent (18, POCSO Act 2012,
  gender-neutral, BNS 2023) and how to actually ask — `"yeh theek hai?"`,
  `"rukna hai?"` — out loud, every time.
- **How to talk to a girlfriend**: listening, asking instead of assuming,
  handling a no without sulking, talking about protection without making it
  awkward. That is the part most apps skip and the part that changes behaviour.
- Red flags that mean *see a doctor*, not *ask the chatbot*.

What it does not do: explicit sexual roleplay or erotic narration. The providers
behind Puter block that upstream, so it would be a button that always fails. What
ships instead is candid, accurate, shame-free education — which is the version
people can actually learn from.

The **18+ gate** is deliberate. Guide mode only turns on after an explicit
confirmation (`"Main 18+ hu"`), the confirmation is stored separately from the
mode flag, and `loadMemory()` refuses to honour `chatMode: 'guide'` without it —
so editing `localStorage` cannot skip the gate. Confirming also starts a fresh
thread, because carrying flirty turns into a lesson produces answers in the
wrong voice.

### The 18+ panel, honestly

The Guide panel is the one place that says out loud what the 18+ switch does and
does not do, because a switch whose limits are hidden looks broken instead of
honest.

**What it turns on**

- **Close mood** — a third voice tone. `intimate` runs at `rate: 84%`,
  `pitch: -4%` with a 780 ms ellipsis pause, against `92% / -2% / 620 ms` for
  `tender`. It is the voice of someone talking to you in a quiet room, and it is
  the single biggest change to how intimate she *sounds*. It also adds a
  prompt instruction: slower, warmer, fewer jokes, more attention on him — and
  explicitly *not* an escalation of what she is willing to say.
- **Chat brain picker** — Nano (default, cheap), Mini, Sonnet, GPT-5.4. All are
  ordinary public models on Puter; none of them changes what she may say, only
  how well she writes it. A stored id that is not in the list is ignored and the
  default is used, so nothing expensive can be selected by accident or by
  editing `localStorage`.

**What it does not turn on**

No explicit sex scenes, no NSFW images, no moaning audio. Every model Puter
routes to blocks that at the provider level, so a switch that "enabled" it would
be a switch that always fails. The panel says this to the user in plain Hindi
rather than letting them find out by asking and getting refused.

If you want that class of product, it needs a provider that permits it — an
uncensored local model, or a service like perchance.org, which is exactly such a
provider. It is not a prompt change in this repo, and pretending otherwise would
ship a broken button.

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
