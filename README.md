# Anya — Virtual Girlfriend (Priya)

A single-page AI companion chat: **Priya** replies in Hinglish and can generate
photos of herself on request.

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
| Photos | `puter.ai.txt2img(prompt, options)` |

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
npm test           # 50 tests: intent detection, chat, images, XSS, errors, persistence, server
npm run lint       # validates every CSS declaration in index.html
```

`npm run lint` exists because this repo previously shipped Tailwind-style
property names (`max-w`, `border-b`, `tracking-letter`) inside a plain `<style>`
block, where every browser silently ignores them. The lint fails the build on
any invalid declaration, caught by `css-tree`'s property validator.

The same class of bug is why the dev server has an explicit allowlist rather
than serving the whole directory: only the three public files are reachable.

## Notes

- Generated images are AI-generated, not real photographs.
- Chat text is rendered with `textContent`, never `innerHTML`.

## License

MIT — see `LICENSE`.
