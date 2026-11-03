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
- Image generation defaults to `gpt-image-2` via OpenAI, which is the most
  expensive option. Set a `model` in `IMAGE_OPTIONS` if that matters — see
  [rate limits and quotas](https://docs.puter.com/rate-limits-and-quotas/).
- History is capped at the last 5 exchanges (`MAX_HISTORY_TURNS`).

## Development

```bash
npm install        # dev-only: jsdom + css-tree for the test suite
npm run check      # CSS lint + full test suite
npm test           # 48 tests: intent detection, chat, images, XSS, errors, persistence, server
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
