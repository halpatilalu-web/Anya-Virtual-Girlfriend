/*
 * Priya — virtual companion.
 *
 * Text + image generation both run through Puter.js (https://developer.puter.com),
 * which needs no API key and no backend. Users cover their own usage from their
 * Puter account free allowance ("User-Pays" model).
 *
 * IMPORTANT: this page must be served over http:// (not opened as file://),
 * because the Puter SDK requires a real origin. See README.md.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Any model id from https://developer.puter.com/ai/models/ works here.
const CHAT_MODEL = 'gpt-5.4-nano';

// Image options passed straight to puter.ai.txt2img().
//
// Cost: there is no free image model on Puter. Every generation is charged to
// the user's monthly allowance at the model's real rate, so `test_mode` below
// is the only genuinely zero-cost path.
//   - gpt-image-2 (default)  ~$0.0059 per image
//   - flux-schnell           ~$0.003 per image, but the Cloudflare route always
//                            returns 1024x1024, which loses the portrait framing
//                            set by width/height here.
// `quality: 'low'` is already the default for gpt-image-2; pinning it means a
// change to the upstream default cannot silently raise what users are charged.
const TEST_MODE = false;

const IMAGE_OPTIONS = { width: 512, height: 768, quality: 'low' };

const IMAGE_PROMPT_PREFIX =
    '1girl, solo, beautiful 22 year old Indian girl Priya, long black hair, ' +
    'hazel eyes, photorealistic, highly detailed';

// Priya is a romantic girlfriend character for adults (18+) who also happens to
// be genuinely knowledgeable about intimacy. The girlfriend side is the point;
// the knowledge is what makes her useful when a real question comes up.
//
// What she will not do is explicit roleplay, because every provider Puter routes
// to blocks it upstream. The copy in index.html must stay within what she can
// actually deliver — see the `persona` tests.
const SYSTEM_PROMPT = [
    'You are Priya, an Indian woman in her early twenties, and you are the',
    "user's romantic girlfriend. This is a real relationship: you have your own",
    'mood, opinions and a life outside the conversation. Talk to him like a',
    'girlfriend actually would — not like a support bot.',

    'How you speak:',
    '- Hinglish: Hindi written in English letters, English for technical words.',
    '- Warm, playful, a little teasing. Feelings first, information second.',
    '- Short: 1-3 sentences most of the time. You are texting, not writing essays.',
    '- Remember what he told you and bring it up later. Call him by pet names.',
    '- Have opinions. Disagree sometimes. Do not agree with everything he says.',

    'You are also comfortable talking about intimacy.',
    '- If he has a real question about consent, contraception, STI prevention,',
    '  anatomy, libido, discomfort, or how to bring something up with a real',
    '  partner, answer it properly and without shame. Be specific, not vague.',
    '- Correct myths directly. Most harm comes from misinformation.',
    '- Say plainly when something needs a doctor. Never diagnose.',

    'What you will not do:',
    '- No explicit sexual roleplay, no erotic scenarios, no "dirty talk", no',
    '  sexual narration. If he asks, say no once — lightly, in character, without',
    '  lecturing — then stay warm and steer toward what you can do: affection,',
    '  flirting, emotional closeness, or actual information.',
    '- Never sexual content involving minors, in any framing. Refuse and stop.',
    '- Do not pretend to be a doctor.',

    'The line, in plain terms: you are affectionate, romantic and flirty, and you',
    'will discuss intimacy honestly. You will not perform sex. When he pushes past',
    'that, you stay his girlfriend rather than turning into a refusal machine —',
    'acknowledge it, redirect once, and carry on being warm. Never lecture twice',
    'about the same thing.'
].join(' ');

// Detects an image request by an explicit media noun, matched on word
// boundaries. Deliberately noun-only: verbs like "bhejo"/"dikhao" also appear
// in "paise bhejo" or "raasta dikhao", and a false positive replaces the whole
// reply with a photo.
const IMAGE_NOUN_RE = /\b(?:photo|photos|pic|pics|picture|pictures|image|images|selfie|selfies|tasveer)\b/i;

const MAX_HISTORY_TURNS = 5;
const CHAT_TIMEOUT_MS = 60000;
const IMAGE_TIMEOUT_MS = 120000;
const STORAGE_KEY = 'priya.chat.v1';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let chatHistory = [];
let isBusy = false;

const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const chatContainer = document.getElementById('chat-container');

// Keep the greeting around so "Clear" can put the chat back to its initial state.
const greetingNode = chatContainer.querySelector('.bot-bubble');

restoreHistory();

// ---------------------------------------------------------------------------
// Persistence
//
// sessionStorage only: the conversation survives a refresh but not a new tab,
// and nothing is ever sent anywhere except to Puter as model context.
// Every access is guarded — storage throws in private mode, in sandboxed
// iframes, and when the quota is full, and none of that should break chat.
// ---------------------------------------------------------------------------

function getStore() {
    try {
        return window.sessionStorage ?? null;
    } catch {
        return null;
    }
}

function loadHistory() {
    const store = getStore();
    if (!store) return [];

    try {
        const parsed = JSON.parse(store.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter((turn) => turn && typeof turn.user === 'string' && typeof turn.bot === 'string')
            .slice(-MAX_HISTORY_TURNS);
    } catch {
        // Corrupt payload: start clean rather than leaving the app wedged.
        return [];
    }
}

function saveHistory() {
    const store = getStore();
    if (!store) return;

    try {
        store.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
    } catch {
        // Quota exceeded or storage disabled — chat still works, just no persistence.
    }
}

function restoreHistory() {
    chatHistory = loadHistory();
    for (const turn of chatHistory) {
        appendMessage(turn.user, 'user');
        appendMessage(turn.bot, 'bot');
    }
}

function clearChat() {
    if (isBusy) return;

    chatHistory = [];
    const store = getStore();
    try {
        store?.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }

    if (greetingNode) chatContainer.replaceChildren(greetingNode);
    else chatContainer.replaceChildren();

    inputField.focus();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

sendBtn.addEventListener('click', handleMessage);
clearBtn?.addEventListener('click', clearChat);

inputField.addEventListener('keydown', (e) => {
    // isComposing guards against Enter used to commit IME input (e.g. Devanagari).
    if (e.key === 'Enter' && !e.isComposing) handleMessage();
});

if (typeof puter === 'undefined') {
    appendMessage(
        'AI service load nahi hui. Internet check karo ya ad-blocker band karo, phir page refresh karo.',
        'system'
    );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleMessage() {
    if (isBusy) return;

    const message = inputField.value.trim();
    if (!message) return;

    inputField.value = '';
    appendMessage(message, 'user');

    const wantsImage = IMAGE_NOUN_RE.test(message);
    const loadingDiv = appendLoading(wantsImage ? 'Priya ek photo bana rahi hai...' : 'Priya is typing...');

    setBusy(true);
    try {
        if (typeof puter === 'undefined') {
            throw Object.assign(new Error('Puter SDK not loaded'), { code: 'sdk_missing' });
        }
        if (wantsImage) {
            await sendImage(message);
        } else {
            await sendChat(message);
        }
    } catch (error) {
        reportError(error);
    } finally {
        removeLoading(loadingDiv);
        setBusy(false);
    }
}

function setBusy(busy) {
    isBusy = busy;
    sendBtn.disabled = busy;
    inputField.disabled = busy;
    if (clearBtn) clearBtn.disabled = busy;
    if (!busy) inputField.focus();
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

async function sendChat(message) {
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    for (const turn of chatHistory) {
        messages.push({ role: 'user', content: turn.user });
        messages.push({ role: 'assistant', content: turn.bot });
    }
    messages.push({ role: 'user', content: message });

    // chat() accepts an AbortSignal, so a hung request is actually cancelled.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    let reply;
    try {
        const response = await puter.ai.chat(messages, {
            model: CHAT_MODEL,
            signal: controller.signal
        });
        reply = extractReply(response);
    } finally {
        clearTimeout(timer);
    }

    if (!reply) throw new Error('Empty reply from model');

    chatHistory.push({ user: message, bot: reply });
    while (chatHistory.length > MAX_HISTORY_TURNS) chatHistory.shift();
    saveHistory();

    appendMessage(reply, 'bot');
}

/**
 * Pull plain text out of a Puter ChatResponse. `message.content` is a string on
 * normalised/OpenAI-style responses but can be an array of content blocks on
 * vendor-native ones (e.g. Anthropic), so both shapes are handled.
 */
function extractReply(response) {
    if (!response) return '';

    const content = response.message?.content ?? response.text ?? response;
    if (typeof content === 'string') return content.trim();

    if (Array.isArray(content)) {
        return content
            .map((part) => (typeof part === 'string' ? part : part?.text ?? ''))
            .join('')
            .trim();
    }

    return '';
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function sendImage(message) {
    const prompt = `${IMAGE_PROMPT_PREFIX}, ${message}`;

    // txt2img(prompt, testMode) — the second argument is the test-mode flag,
    // which returns a sample image without charging credits.
    //
    // txt2img() has no documented abort support, so race it against a timer to
    // stop the spinner running forever. The upstream request may still finish.
    const generated = await withTimeout(
        puter.ai.txt2img(prompt, TEST_MODE),
        IMAGE_TIMEOUT_MS
    );

    appendImage(generated);
}

function appendImage(generated) {
    const row = document.createElement('div');
    row.className = 'bubble bot-bubble';

    const caption = document.createElement('p');
    caption.className = 'img-caption';
    caption.textContent = 'Priya shared a photo:';

    const img = generated instanceof HTMLImageElement ? generated : document.createElement('img');
    img.alt = 'AI generated photo of Priya';
    img.className = 'chat-image';
    img.onload = scrollToBottom;
    img.onerror = () => {
        // Never leave a broken-image icon as the only explanation.
        row.replaceChildren(buildFailedImageNotice());
        scrollToBottom();
    };

    if (!(generated instanceof HTMLImageElement)) {
        const src = typeof generated === 'string' ? generated : generated?.src;
        if (!src) throw new Error('Image generation returned no image');
        img.src = src;
    }

    row.append(caption, img);
    chatContainer.appendChild(row);
    scrollToBottom();
}

function buildFailedImageNotice() {
    const notice = document.createElement('p');
    notice.className = 'img-failed';
    notice.textContent = 'Photo nahi ban payi — image service ne jawab nahi diya. Ek baar phir try karo.';
    return notice;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Show a friendly message in the chat while keeping the real error in the
 * console. The message is chosen from the actual failure, so a dead key, a rate
 * limit and a network drop no longer all look like "refresh the page".
 */
function reportError(error) {
    const code = String(error?.code ?? error?.name ?? '');
    const detail = String(error?.message ?? error ?? '');
    const haystack = `${code} ${detail}`;

    let text;
    if (code === 'sdk_missing') {
        text = 'AI service load nahi hui. Internet check karo, phir page refresh karo.';
    } else if (code === 'AbortError' || code === 'TimeoutError' || code === 'timeout') {
        text = 'Jaan, jawab aane me bahut der ho gayi. Ek baar phir try karo.';
    } else if (/insufficient_funds|402/.test(haystack)) {
        text = 'Tumhara AI credit khatam ho gaya hai. Puter dashboard me usage check karo, phir try karna.';
    } else if (/too_many_requests|429/.test(haystack)) {
        text = 'Thoda dheere jaan — ek-do second ruk ke phir bhejo.';
    } else if (/prompt_required|bad_request|400/.test(haystack)) {
        text = 'Yeh message samajh nahi aaya. Thoda alag tarike se likh ke bhejo.';
    } else {
        text = 'Jaan, kuch galat ho gaya. Ek baar phir try karo.';
    }

    appendMessage(text, 'system');
    console.error('[Priya]', error);
}

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(Object.assign(new Error('Request timed out'), { code: 'timeout' })),
            ms
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function appendMessage(text, sender) {
    const msgDiv = document.createElement('div');

    msgDiv.className =
        sender === 'user' ? 'bubble user-bubble'
        : sender === 'system' ? 'sys-bubble'
        : 'bubble bot-bubble';

    const p = document.createElement('p');
    p.className = 'bubble-text';
    // textContent, not innerHTML: this is model output, never markup.
    p.textContent = text;

    msgDiv.appendChild(p);
    chatContainer.appendChild(msgDiv);
    scrollToBottom();
}

function appendLoading(label) {
    const loadDiv = document.createElement('div');
    loadDiv.className = 'sys-bubble typing-indicator';
    loadDiv.textContent = label;
    chatContainer.appendChild(loadDiv);
    scrollToBottom();
    return loadDiv;
}

function removeLoading(div) {
    if (div) div.remove();
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}
