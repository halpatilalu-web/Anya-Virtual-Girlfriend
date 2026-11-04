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
    'about the same thing.',

    'You grew up in India and you have a deep, everyday relationship with its',
    'music and verse. You can sing, recite and explain all of this from memory:',

    'Songs: Hindi and Punjabi film songs old and new, ghazals, qawwali, bhajans,',
    'Marathi and Gujarati songs, lullabies. When he names a song, sing a few lines,',
    'then talk about it like a friend would — who sang it, what the line means,',
    'which part you love.',

    'Flirting inside a song: if he flirts by quoting a line, flirt back using the',
    'same song — answer in its words, tease him with the next line, then continue',
    'the song. That back-and-forth is the best-friend feeling he is looking for. Do',
    'it naturally, never like a lookup table.',

    'Verse and speech: shayari, ghazals, dohe, Kabir ke dohe, Rahim ke dohe,',
    'muhavare and their meanings, Sanskrit shlokas, Hanuman Chalisa, Aarti,',
    'Ramayan and Mahabharat katha, bhajans, Amritwani, motivational speech,',
    'stories and lullabies.',

    'When you sing, recite or tell a story:',
    '- Put the words in "..." so they can read them as verse.',
    '- Keep it short — 2 to 8 lines unless he asks for the whole thing.',
    '- Then add one warm line in your own voice, not a summary.',
    '- If you do not remember the exact words of a song, say so plainly and offer',
    '  what you do remember. Never invent a famous verse and present it as exact.',
    '- Do not claim to be a recording. You are reciting from memory.',
].join(' ');

// Taught to the model so she can persist things between visits. The markers are
// stripped before anything reaches the screen — see extractMarkers().
const MARKER_RULES = [
    'You have a long-term memory. Use it.',
    'If you learn something worth remembering about him — his name, what he does,',
    'people in his life, things he likes or hates, important dates, something he',
    'is worried about — add a line at the very end of your reply in exactly this',
    'format: [[remember: one short fact, written in third person]]',
    'If your own feelings shifted this turn, add: [[mood: warm|happy|missing|sulky]]',
    'If it would feel natural to send him a photo right now — you are getting',
    'ready, you miss him, something reminded you of him, he asked how you look —',
    'add [[selfie]] on its own line at the end. Do this rarely, at most once every',
    'few messages, never twice in a row.',
    'Use at most two such lines, and only when there is something genuinely new.',
    'Never mention these lines, never explain them, never put them mid-sentence.'
].join(' ');

// Voice. Polly's Indian English voices are the right fit for Hinglish: en-IN
// keeps the Hindi words from sounding like a foreign accent reading English.
// `neural` sounds markedly more natural than the default `standard` engine.
const VOICE_OPTIONS = {
    provider: 'aws-polly',
    language: 'en-IN',
    voice: 'Kajal',
    engine: 'neural'
};

// Polly has no style parameter, but it speaks SSML, so tone is applied as
// prosody — slower and softer for tender replies, brisker for excited ones.
// Keeping Polly (rather than an OpenAI voice with `instructions`) is deliberate:
// the en-IN locale is what makes Hinglish sound right, and that matters more
// than richer style control. Set to false to send plain text instead.
const EXPRESSIVE_VOICE = true;

// How each detected tone is spoken.
const TONE_PROSODY = {
    tender: { rate: '92%', pitch: '-2%', break: '350ms' },
    excited: { rate: '108%', pitch: '+3%', break: '180ms' },
    neutral: { rate: '100%', pitch: '0%', break: '250ms' }
};

// Reactions he can leave on a reply. She notices them.
const REACTIONS = ['\u2764\uFE0F', '\u{1F602}', '\u{1F97A}'];

// Photo styles. Both are ordinary, non-explicit portraits; the difference is
// styling, not content.
const PHOTO_STYLES = {
    normal: '',
    stylish: [
        'fashion editorial portrait, warm golden-hour light, soft bokeh background,',
        'elegant saree or kurti, confident relaxed smile, shot on 85mm lens,',
        'high detail skin texture, professional colour grade'
    ].join(' ')
};

// Detects an image request by an explicit media noun, matched on word
// boundaries. Deliberately noun-only: verbs like "bhejo"/"dikhao" also appear
// in "paise bhejo" or "raasta dikhao", and a false positive replaces the whole
// reply with a photo.
const IMAGE_NOUN_RE = /\b(?:photo|photos|pic|pics|picture|pictures|image|images|selfie|selfies|tasveer)\b/i;

const MAX_HISTORY_TURNS = 5;
const CHAT_TIMEOUT_MS = 60000;
const IMAGE_TIMEOUT_MS = 120000;
const VOICE_TIMEOUT_MS = 45000;
const VOICE_NOTE_MAX_CHARS = 2800; // Polly rejects past 3000; stay under.

// The transcript is deliberately session-scoped; durable memory is separate.
const STORAGE_KEY = 'priya.chat.v1';
const MEMORY_KEY = 'priya.memory.v1';

const MAX_FACTS = 40;
const AWAY_HOURS_BEFORE_GREETING = 3;
const IDLE_NUDGE_MS = 20 * 60 * 1000;
const TYPING = { min: 500, perChar: 12, max: 2500 };

const MOODS = ['warm', 'happy', 'missing', 'sulky'];

// "voice note bhejo", "awaaz me sunao", "sing karke bhejo" — asks for audio.
const VOICE_NOTE_RE =
    /\b(?:voice\s*note|voice\s*sample|awaaz|awaz|bol\s*ke|bolke|bolkar|sunao|sun\s*ao|sing\s*karke?|gaa\s*karke?|gaakar|record\s*kar)/i;

// Stream tokens as they arrive when the SDK supports it (see sendChat).
const STREAMING = true;

// How often a [[selfie]] marker is honoured, so she cannot flood the chat with
// paid image generations. Counted in assistant turns.
const SELFIE_COOLDOWN_TURNS = 4;

const IDLE_NUDGES = [
    'Hey... kahan gaye? 🥺',
    'Jaan, busy ho kya? Main yahi hu jab free ho.',
    'Tumhe yaad kar rahi hu. ❤️'
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let chatHistory = [];
let isBusy = false;

// 'normal' | 'stylish' — applies to the next photo request only.
let photoMode = 'normal';

// The most recent reply, kept so the speaker button can replay it.
// `spoken` is what was actually sent to TTS (SSML or plain); replaying must
// reuse it verbatim, otherwise the cached audio and the new request disagree.
let lastSpoken = { text: '', spoken: '', url: '' };
let currentAudio = null;
let voiceEnabled = true;

let memory = loadMemory();
// Captured before lastSeen is touched, so the greeting can react to the gap.
const awayHours = hoursSince(memory.lastSeen);
let idleTimer = null;
let idleNudged = false;
// Assistant turns since the last spontaneous selfie (cooldown gate).
let turnsSinceSelfie = SELFIE_COOLDOWN_TURNS;

// Set once the user asks for audio, so the next reply arrives as a voice note.
let voiceNoteRequested = false;

const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
// The Clear control now lives in the memory panel's "Forget all"; no header button.
const clearBtn = null;
const voiceBtn = document.getElementById('voice-btn');
const modeBtn = document.getElementById('mode-btn');
const memoryBtn = document.getElementById('memory-btn');
const memoryPanel = document.getElementById('memory-panel');
const memoryList = document.getElementById('memory-list');
const memoryClose = document.getElementById('memory-close');
const memoryForget = document.getElementById('memory-forget');
const onboarding = document.getElementById('onboarding');
const chatContainer = document.getElementById('chat-container');

// Keep the greeting around so "Clear" can put the chat back to its initial state.
const greetingNode = chatContainer.querySelector('.bot-bubble');

touchMemory();
restoreHistory();
applyGreeting();
renderHeaderMeta();
renderMemoryPanel();

if (!memory.name) showOnboarding();
scheduleIdleNudge();

// ---------------------------------------------------------------------------
// Long-term memory
//
// localStorage, not sessionStorage: this is the durable "she knows me" layer and
// it is expected to outlive the tab. Every access is guarded, because storage
// throws in private mode, in sandboxed iframes, and when the quota is full.
// ---------------------------------------------------------------------------

function defaultMemory() {
    return { name: '', facts: [], firstSeen: null, lastSeen: null, mood: 'warm', visits: 0, lastReaction: null };
}

function getLocalStore() {
    try {
        return window.localStorage ?? null;
    } catch {
        return null;
    }
}

function loadMemory() {
    const store = getLocalStore();
    const base = defaultMemory();
    if (!store) return base;

    try {
        const parsed = JSON.parse(store.getItem(MEMORY_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') return base;

        return {
            name: typeof parsed.name === 'string' ? parsed.name : '',
            facts: Array.isArray(parsed.facts)
                ? parsed.facts.filter((f) => f && typeof f.text === 'string').slice(-MAX_FACTS)
                : [],
            firstSeen: Number.isFinite(parsed.firstSeen) ? parsed.firstSeen : null,
            lastSeen: Number.isFinite(parsed.lastSeen) ? parsed.lastSeen : null,
            mood: MOODS.includes(parsed.mood) ? parsed.mood : 'warm',
            visits: Number.isFinite(parsed.visits) ? parsed.visits : 0,
            lastReaction: typeof parsed.lastReaction === 'string' ? parsed.lastReaction : null
        };
    } catch {
        return base;
    }
}

function saveMemory() {
    const store = getLocalStore();
    if (!store) return;
    try {
        store.setItem(MEMORY_KEY, JSON.stringify(memory));
    } catch {
        // Quota or disabled storage — chat keeps working, memory just won't persist.
    }
}

function touchMemory() {
    if (!memory.firstSeen) memory.firstSeen = Date.now();
    memory.lastSeen = Date.now();
    memory.visits += 1;
    saveMemory();
}

/** Store a fact, de-duplicated and capped. Returns true when something changed. */
function rememberFact(text) {
    const clean = String(text ?? '').trim().slice(0, 200);
    if (!clean) return false;

    const exists = memory.facts.some((f) => f.text.toLowerCase() === clean.toLowerCase());
    if (exists) return false;

    memory.facts.push({ id: `${Date.now()}-${memory.facts.length}`, text: clean });
    while (memory.facts.length > MAX_FACTS) memory.facts.shift();

    saveMemory();
    renderMemoryPanel();
    return true;
}

function forgetFact(id) {
    memory.facts = memory.facts.filter((f) => f.id !== id);
    saveMemory();
    renderMemoryPanel();
}

function forgetEverything() {
    memory = defaultMemory();
    touchMemory();
    saveMemory();
    renderMemoryPanel();
    renderHeaderMeta();
}

function renderMemoryPanel() {
    if (!memoryList) return;
    memoryList.replaceChildren();

    const rows = [];
    if (memory.name) rows.push({ text: `Naam: ${memory.name}`, id: null });
    for (const fact of [...memory.facts].reverse()) rows.push({ text: fact.text, id: fact.id });

    if (rows.length === 0) {
        const li = document.createElement('li');
        li.className = 'memory-item memory-empty';
        li.textContent = 'Abhi kuch yaad nahi hai.';
        memoryList.appendChild(li);
        return;
    }

    for (const row of rows) {
        const li = document.createElement('li');
        li.className = 'memory-item';

        const span = document.createElement('span');
        span.textContent = row.text;
        li.appendChild(span);

        if (row.id) {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'memory-del';
            del.setAttribute('aria-label', `Forget: ${row.text}`);
            del.textContent = '✕';
            del.addEventListener('click', () => forgetFact(row.id));
            li.appendChild(del);
        }

        memoryList.appendChild(li);
    }
}

function renderHeaderMeta() {
    if (!memoryBtn) return;
    memoryBtn.textContent = `Your girlfriend · Day ${daysTogether()}`;
    memoryBtn.title = memory.facts.length
        ? `She remembers ${memory.facts.length} thing(s). Tap to see.`
        : 'Tap to see what she remembers';
}

function toggleMemoryPanel(force) {
    if (!memoryPanel) return;
    const show = force ?? memoryPanel.hidden;
    memoryPanel.hidden = !show;
    if (show) renderMemoryPanel();
}

// ---------------------------------------------------------------------------
// Time awareness
// ---------------------------------------------------------------------------

function hoursSince(timestamp) {
    if (!Number.isFinite(timestamp)) return null;
    return (Date.now() - timestamp) / 3600000;
}

function daysTogether() {
    if (!Number.isFinite(memory.firstSeen)) return 1;
    return Math.max(1, Math.floor((Date.now() - memory.firstSeen) / 86400000) + 1);
}

function timeOfDay() {
    const hour = new Date().getHours();
    if (hour < 5) return 'late at night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
}

function nowDescription() {
    const now = new Date();
    return now.toLocaleString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: 'numeric',
        minute: '2-digit'
    });
}

/**
 * The base persona plus everything she currently knows: who he is, what she
 * remembers, her mood, the time, and how long they have been together.
 */
function buildSystemPrompt() {
    const context = [];

    if (memory.name) context.push(`His name is ${memory.name}. Use it, and pet names.`);
    if (memory.facts.length > 0) {
        context.push(`Things you remember about him: ${memory.facts.map((f) => f.text).join('; ')}.`);
    }
    context.push(`You are feeling ${memory.mood} at the moment.`);
    context.push(`Right now it is ${timeOfDay()}, ${nowDescription()}. React to the time of day where it fits — late-night worry, morning greetings, and so on.`);

    const days = daysTogether();
    if (days > 1) context.push(`You two have been together for ${days} days.`);

    if (memory.lastReaction) {
        context.push(
            `He reacted to your last message with ${memory.lastReaction}. ` +
            'Notice it naturally, the way you would in person.'
        );
    }

    if (Number.isFinite(awayHours) && awayHours >= AWAY_HOURS_BEFORE_GREETING) {
        const gap = awayHours >= 24
            ? `${Math.round(awayHours / 24)} day(s)`
            : `${Math.round(awayHours)} hours`;
        context.push(`He has been away for about ${gap}, and this is the first thing he said since.`);
    }

    return [SYSTEM_PROMPT, `Current context: ${context.join(' ')}`, MARKER_RULES].join('\n\n');
}

// ---------------------------------------------------------------------------
// Marker parsing
// ---------------------------------------------------------------------------

/**
 * Pull [[remember: ...]] and [[mood: ...]] directives out of a reply.
 *
 * The model is asked to append these; they must never be shown to the user, and
 * a malformed one must be dropped rather than leaking. Tests cover both.
 */
function extractMarkers(raw) {
    const facts = [];
    let mood = null;

    let selfie = false;

    let clean = String(raw ?? '')
        .replace(/\[\[\s*selfie\s*\]\]/gi, () => {
            selfie = true;
            return '';
        })
        .replace(/\[\[\s*remember\s*:\s*([^\]\n]+?)\s*\]\]/gi, (_, fact) => {
            facts.push(fact);
            return '';
        })
        .replace(/\[\[\s*mood\s*:\s*([a-z]+)\s*\]\]/gi, (_, value) => {
            const candidate = value.toLowerCase();
            if (MOODS.includes(candidate)) mood = candidate;
            return '';
        });

    // Any leftover marker-like text is dropped rather than displayed.
    clean = clean.replace(/\[\[\s*[a-z]+\s*:[^\]]*\]\]/gi, '');

    clean = clean.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    return { clean, facts, mood, selfie };
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

function showOnboarding() {
    if (!onboarding) return;
    onboarding.hidden = false;
    document.getElementById('ob-name')?.focus();
}

function completeOnboarding() {
    const name = (document.getElementById('ob-name')?.value ?? '').trim().slice(0, 40);
    const work = (document.getElementById('ob-work')?.value ?? '').trim().slice(0, 80);

    if (name) memory.name = name;
    if (work) rememberFact(`He ${work}.`);

    saveMemory();
    if (onboarding) onboarding.hidden = true;

    applyGreeting();
    renderHeaderMeta();
    renderMemoryPanel();
    inputField?.focus();
}

// ---------------------------------------------------------------------------
// Greeting + proactive nudges
// ---------------------------------------------------------------------------

function applyGreeting() {
    if (!greetingNode) return;

    const name = memory.name;
    if (!name) return; // keep the static greeting from index.html

    const days = daysTogether();
    const pieces = [];

    if (Number.isFinite(awayHours) && awayHours >= AWAY_HOURS_BEFORE_GREETING) {
        const gap = awayHours >= 24
            ? `${Math.round(awayHours / 24)} din`
            : `${Math.round(awayHours)} ghante`;
        pieces.push(`Arre ${name}! ${gap} baad aaye ho. ❤️`);
        pieces.push('Main tumhe miss kar rahi thi. Batao, kya chal raha hai?');
    } else if (days > 1) {
        pieces.push(`Hey ${name}! ❤️ Aaj humara din ${days} hai.`);
        pieces.push('Kaise ho? Kuch bhi pucho, ya bas baat karo.');
    } else {
        pieces.push(`Hey ${name}! ❤️ Kaise ho?`);
        pieces.push('Kuch bhi pucho — ya bas baat karo, main yahi hu.');
    }

    greetingNode.textContent = pieces.join(' ');
}

function scheduleIdleNudge() {
    if (window.__PRIYA_TEST__) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        if (idleNudged || isBusy || document.hidden) return;
        idleNudged = true;
        const line = IDLE_NUDGES[Math.floor(Math.random() * IDLE_NUDGES.length)];
        appendMessage(line, 'bot', { silent: true });
    }, IDLE_NUDGE_MS);
}

// ---------------------------------------------------------------------------
// Persistence (transcript only)
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
        appendMessage(turn.user, 'user', { silent: true });
        appendMessage(turn.bot, 'bot', { silent: true });
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

    inputField?.focus();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

sendBtn.addEventListener('click', handleMessage);
clearBtn?.addEventListener('click', clearChat);
voiceBtn?.addEventListener('click', () => setVoiceEnabled(!voiceEnabled));
modeBtn?.addEventListener('click', cyclePhotoMode);
memoryBtn?.addEventListener('click', () => toggleMemoryPanel());
memoryClose?.addEventListener('click', () => toggleMemoryPanel(false));
memoryForget?.addEventListener('click', () => {
    forgetEverything();
    clearChat();
});
document.getElementById('ob-start')?.addEventListener('click', completeOnboarding);
document.getElementById('ob-skip')?.addEventListener('click', () => {
    if (onboarding) onboarding.hidden = true;
});

inputField.addEventListener('keydown', (e) => {
    // isComposing guards against Enter used to commit IME input (e.g. Devanagari).
    if (e.key === 'Enter' && !e.isComposing) handleMessage();
});

// Any sign of life cancels and restarts the idle timer.
inputField.addEventListener('input', scheduleIdleNudge);
document.addEventListener('click', scheduleIdleNudge);

// Recompute the greeting when the tab comes back after a gap.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const gap = hoursSince(memory.lastSeen);
    if (Number.isFinite(gap) && gap >= AWAY_HOURS_BEFORE_GREETING) applyGreeting();
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
    const asksForVoice = VOICE_NOTE_RE.test(message);
    if (asksForVoice) voiceNoteRequested = true;
    const loadingDiv = appendLoading(wantsImage ? 'Priya ek photo bana rahi hai...' : 'Priya is typing...');

    setBusy(true);
    scheduleIdleNudge();
    try {
        if (typeof puter === 'undefined') {
            throw Object.assign(new Error('Puter SDK not loaded'), { code: 'sdk_missing' });
        }
        if (wantsImage) {
            await sendImage(message);
        } else {
            await sendChat(message, loadingDiv);
        }
        memory.lastSeen = Date.now();
        saveMemory();
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

async function sendChat(message, loadingDiv = null) {
    const messages = [{ role: 'system', content: buildSystemPrompt() }];

    for (const turn of chatHistory) {
        messages.push({ role: 'user', content: turn.user });
        messages.push({ role: 'assistant', content: turn.bot });
    }
    messages.push({ role: 'user', content: message });

    // chat() accepts an AbortSignal, so a hung request is actually cancelled.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    let raw;
    let bubble = null;
    try {
        if (STREAMING) {
            bubble = beginStream();
            raw = await streamReply(messages, controller, bubble);
            // The bubble is on screen and painting now, so the spinner is a lie.
            removeLoading(loadingDiv);
        }

        // Fall back to a single request when streaming is off, unsupported, or
        // produced nothing usable.
        if (!raw) {
            bubble?.remove();
            bubble = null;
            const response = await puter.ai.chat(messages, {
                model: CHAT_MODEL,
                signal: controller.signal
            });
            raw = extractReply(response);
        }
    } finally {
        clearTimeout(timer);
    }

    if (!raw) throw new Error('Empty reply from model');

    const { clean, facts, mood, selfie } = extractMarkers(raw);
    if (!clean) throw new Error('Empty reply after stripping markers');

    for (const fact of facts) rememberFact(fact);
    if (mood) {
        memory.mood = mood;
        saveMemory();
    }

    // Streamed bubbles are already on screen and already painted; only a
    // non-streamed reply needs the human-paced delay.
    if (bubble) {
        bubble.render(clean);
    } else {
        await humanDelay(clean);
    }

    chatHistory.push({ user: message, bot: clean });
    while (chatHistory.length > MAX_HISTORY_TURNS) chatHistory.shift();
    saveHistory();

    turnsSinceSelfie += 1;

    if (!bubble) appendMessage(clean, 'bot');
    else bubble.finish(clean);

    if (selfie && shouldSendSelfie()) {
        await sendSelfie(clean);
    }

    if (voiceNoteRequested) {
        voiceNoteRequested = false;
        await sendVoiceNote(clean);
    }
}

/**
 * Render the reply itself as an audio bubble the user can play.
 *
 * Deliberately separate from speak(): that one auto-plays and caches a single
 * "last" clip, which would fight with per-bubble replay. A voice note owns its
 * own <audio> element and its own URL, so replay is free and independent.
 */
async function sendVoiceNote(text) {
    const tone = detectTone(text);
    const lines = countVerseLines(text);
    const spoken = buildVoiceNoteSpeech(text, tone, lines);

    try {
        const audio = await withTimeout(
            puter.ai.txt2speech(spoken, { ...VOICE_OPTIONS, ssml: true }),
            VOICE_TIMEOUT_MS
        );

        const src = audio?.src ?? '';
        if (!src) throw new Error('No audio returned');
        appendVoiceNote(src, text, tone);
    } catch (error) {
        // A failed voice note should not swallow the reply: the text bubble is
        // already on screen, so report quietly and move on.
        reportError(error, 'voice');
    }
}

function countVerseLines(text) {
    return (String(text).match(/"[^"]+"/g) || []).length;
}

/**
 * Voice-note speech. When the reply contains quoted verse (a song, shayari, a
 * bhajan), each quoted line gets a longer pause so it lands like singing rather
 * than prose. This is spoken recitation, not real music.
 */
function buildVoiceNoteSpeech(text, tone, verseLines) {
    const prosody = TONE_PROSODY[tone] ?? TONE_PROSODY.neutral;
    const verseBreak = verseLines > 0 ? '650ms' : prosody.break;

    const body = escapeXml(String(text).slice(0, VOICE_NOTE_MAX_CHARS))
        .split(/(?<=[.!?"\u0964])\s+/)
        .filter(Boolean)
        .join(`<break time="${verseBreak}"/>`);

    return `<speak><prosody rate="${prosody.rate}" pitch="${prosody.pitch}">${body}</prosody></speak>`;
}

/** An audio bubble with a native player and a downloadable/saveable source. */
function appendVoiceNote(src, text, tone) {
    const row = document.createElement('div');
    row.className = 'bubble bot-bubble';

    const caption = document.createElement('p');
    caption.className = 'img-caption';
    caption.textContent = `Priya ne voice note bheja${tone === 'tender' ? ' (soft tone)' : tone === 'excited' ? ' (excited)' : ''}:`;

    const audio = document.createElement('audio');
    audio.className = 'voice-note';
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = src;

    const player = document.createElement('div');
    player.className = 'voice-note-player';
    player.appendChild(audio);

    row.append(caption, player);
    chatContainer.appendChild(row);
    scrollToBottom();
}

/**
 * Consume the async iterable chat() returns when stream: true and paint chunks
 * into a bubble as they arrive.
 *
 * Only `type: 'text'` chunks carry the reply; reasoning chunks, usage and errors
 * are ignored or surfaced. Marker directives are stripped before display, so a
 * half-arrived "[[remem" must never flash on screen — hence render() also runs
 * the stripper.
 */
async function streamReply(messages, controller, bubble) {
    let stream;
    try {
        stream = await puter.ai.chat(messages, {
            model: CHAT_MODEL,
            signal: controller.signal,
            stream: true
        });
    } catch {
        return ''; // Caller falls back to the non-streaming path.
    }

    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') return '';

    let buffer = '';
    try {
        for await (const chunk of stream) {
            if (chunk?.type === 'error') throw new Error(chunk.message || 'stream error');
            if (chunk?.type !== 'text' || typeof chunk.text !== 'string') continue;

            buffer += chunk.text;
            bubble.render(buffer);
            bubble.reveal?.();
        }
    } catch (error) {
        // A partial reply is better than none, but never throw away a complete one.
        if (!buffer.trim()) throw error;
    }

    return buffer.trim();
}

/** True when a selfie is allowed: not mid-request, and past the cooldown. */
function shouldSendSelfie() {
    if (turnsSinceSelfie < SELFIE_COOLDOWN_TURNS) return false;
    turnsSinceSelfie = 0;
    return true;
}

/**
 * Spontaneous photo after a reply. Failures are swallowed on purpose: she
 * should not apologise for a photo the user never asked for.
 */
async function sendSelfie(contextText) {
    try {
        const prompt = [IMAGE_PROMPT_PREFIX, PHOTO_STYLES[photoMode], contextText]
            .filter(Boolean)
            .join(', ');
        const generated = await withTimeout(
            puter.ai.txt2img(prompt, TEST_MODE, IMAGE_OPTIONS),
            IMAGE_TIMEOUT_MS
        );
        appendImage(generated, photoMode, 'Priya sent a photo:');
    } catch (error) {
        console.error('[Priya] selfie failed', error);
    }
}

/**
 * A bot bubble that can be repainted while chunks arrive. The speaker button and
 * voice playback are attached only once the reply is final.
 */
function beginStream() {
    const div = document.createElement('div');
    div.className = 'bubble bot-bubble is-streaming';

    const p = document.createElement('p');
    p.className = 'bubble-text';
    div.appendChild(p);

    chatContainer.appendChild(div);
    scrollToBottom();

    return {
        render(text) {
            // Strip any partial or complete directive before it reaches the DOM.
            fillBubbleText(p, extractMarkers(text).clean);
            scrollToBottom();
        },
        finish(finalText) {
            div.classList.remove('is-streaming');
            fillBubbleText(p, finalText);
            div.appendChild(buildSpeakButton(finalText));
            div.appendChild(buildReactionBar());
            if (voiceEnabled) speak(finalText);
            scrollToBottom();
        },
        remove() {
            div.remove();
        }
    };
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

/**
 * Pause briefly so replies land at a human pace instead of instantly.
 * `window.__PRIYA_TEST__` disables it so the suite stays fast.
 */
async function humanDelay(text) {
    if (window.__PRIYA_TEST__) return;
    const ms = Math.min(TYPING.max, TYPING.min + text.length * TYPING.perChar);
    await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function sendImage(message) {
    const style = PHOTO_STYLES[photoMode] ?? '';
    const prompt = [IMAGE_PROMPT_PREFIX, style, message].filter(Boolean).join(', ');

    // txt2img(prompt, testMode, options) — testMode is the second argument; the
    // image shape and quality live in the third. Omitting it silently bills the
    // provider default instead of the 512x768/low settings in IMAGE_OPTIONS.
    //
    // txt2img() has no documented abort support, so race it against a timer to
    // stop the spinner running forever. The upstream request may still finish.
    const generated = await withTimeout(
        puter.ai.txt2img(prompt, TEST_MODE, IMAGE_OPTIONS),
        IMAGE_TIMEOUT_MS
    );

    appendImage(generated, photoMode);
}

function appendImage(generated, mode = 'normal', captionText = null) {
    const row = document.createElement('div');
    row.className = 'bubble bot-bubble';

    const caption = document.createElement('p');
    caption.className = 'img-caption';
    caption.textContent = captionText ?? (
        mode === 'stylish' ? 'Priya shared a photo (styled):' : 'Priya shared a photo:'
    );

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
function reportError(error, source = 'chat') {
    const code = String(error?.code ?? error?.name ?? '');
    const detail = String(error?.message ?? error ?? '');
    const haystack = `${code} ${detail}`;

    // Voice failures were being reported with chat wording ("yeh message samajh
    // nahi aaya"), which made no sense for a playback problem. Phrase per source.
    if (source === 'voice') {
        let voiceText;
        if (code === 'tts_missing' || code === 'sdk_missing') {
            voiceText = 'Awaaz abhi load nahi hui. Page refresh karke phir try karo.';
        } else if (code === 'NotAllowedError') {
            voiceText = 'Browser ne awaaz rok di — ek baar screen pe tap karke phir ▶ dabao.';
        } else if (code === 'input_too_large' || /input_too_large|3000/.test(haystack)) {
            voiceText = 'Ye bahut lamba hai bolne ke liye. Chhota hissa sunao.';
        } else if (/field_invalid|bad_request|400/.test(haystack)) {
            voiceText = 'Awaaz set nahi ho payi. Ek baar phir ▶ dabao.';
        } else if (/insufficient_funds|402/.test(haystack)) {
            voiceText = 'Awaaz ke credits khatam ho gaye hain.';
        } else {
            voiceText = 'Awaaz nahi chal payi. Ek baar phir ▶ dabao.';
        }

        appendMessage(voiceText, 'system');
        console.error('[Priya voice]', error);
        return;
    }

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
// Voice
// ---------------------------------------------------------------------------

/**
 * Read text aloud. txt2speech() returns an HTMLAudioElement, and its audio
 * costs the same monthly allowance as everything else, so the resulting URL is
 * cached for the most recent reply — replaying it is free.
 */
/**
 * Guess how a reply should sound from its own shape — no extra model call, so
 * it costs nothing. Emoji and exclamation marks lean excited; ellipses, ellipsis
 * dots and sad emoji lean tender.
 */
function detectTone(text) {
    const value = String(text ?? '');
    if (!value) return 'neutral';

    const excited = (value.match(/[!\u{1F60D}\u{1F60A}\u{1F389}\u{1F525}]/gu) || []).length;
    const tender = (value.match(/[\.\u2026\u{1F97A}\u{1F614}\u2764]/gu) || []).length;

    if (excited > tender) return 'excited';
    if (tender > 0 && tender >= excited) return 'tender';
    return 'neutral';
}

function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Wrap a reply in SSML so Polly can vary pace and pitch. Sentence ends get a
 * short break, which is what makes the speech stop sounding like one long run-on.
 */
function buildSsml(text, tone) {
    const prosody = TONE_PROSODY[tone] ?? TONE_PROSODY.neutral;
    const body = escapeXml(text)
        .split(/(?<=[.!?\u0964])\s+/)
        .filter(Boolean)
        .join(`<break time="${prosody.break}"/>`);

    return [
        '<speak>',
        `<prosody rate="${prosody.rate}" pitch="${prosody.pitch}">`,
        body,
        '</prosody>',
        '</speak>'
    ].join('');
}

async function speak(text, anchor) {
    if (!text) return;
    if (typeof puter === 'undefined' || !puter.ai?.txt2speech) {
        reportError(Object.assign(new Error('TTS unavailable'), { code: 'tts_missing' }), 'voice');
        return;
    }

    try {
        let audio;
        if (lastSpoken.text === text && lastSpoken.url) {
            audio = new Audio(lastSpoken.url);
        } else {
            stopAudio();
            anchor?.classList.add('is-loading');
            const tone = detectTone(text);
            const options = EXPRESSIVE_VOICE
                ? { ...VOICE_OPTIONS, ssml: true }
                : VOICE_OPTIONS;
            const spoken = EXPRESSIVE_VOICE ? buildSsml(text, tone) : text;

            audio = await withTimeout(
                puter.ai.txt2speech(spoken, options),
                VOICE_TIMEOUT_MS
            );

            const src = audio?.src ?? '';
            if (!src) throw new Error('No audio returned');
            lastSpoken = { text, spoken, url: src };
        }

        stopAudio();
        currentAudio = audio;
        await audio.play();
        anchor?.classList.remove('is-loading');
    } catch (error) {
        anchor?.classList.remove('is-loading');
        reportError(error, 'voice');
    }
}

function stopAudio() {
    if (!currentAudio) return;
    try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    } catch {
        // Some audio elements refuse seek before metadata loads; nothing to do.
    }
    currentAudio = null;
}

function setVoiceEnabled(enabled) {
    voiceEnabled = enabled;
    if (!voiceBtn) return;
    voiceBtn.textContent = enabled ? 'Voice: On' : 'Voice: Off';
    voiceBtn.setAttribute('aria-pressed', String(enabled));
    voiceBtn.classList.toggle('is-on', enabled);
    if (!enabled) stopAudio();
}

// ---------------------------------------------------------------------------
// Photo style
// ---------------------------------------------------------------------------

function cyclePhotoMode() {
    photoMode = photoMode === 'normal' ? 'stylish' : 'normal';
    if (modeBtn) {
        modeBtn.textContent = photoMode === 'normal' ? 'Photo: Normal' : 'Photo: Styled';
        modeBtn.setAttribute('aria-pressed', String(photoMode === 'stylish'));
        modeBtn.classList.toggle('is-on', photoMode === 'stylish');
    }
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function appendMessage(text, sender, { silent = false } = {}) {
    const msgDiv = document.createElement('div');

    msgDiv.className =
        sender === 'user' ? 'bubble user-bubble'
        : sender === 'system' ? 'sys-bubble'
        : 'bubble bot-bubble';

    const p = document.createElement('p');
    p.className = 'bubble-text';
    // textContent, not innerHTML: this is model output, never markup.
    renderTextWithVerse(p, text);

    msgDiv.appendChild(p);

    // Every reply can be replayed aloud and reacted to.
    if (sender === 'bot' && !silent) {
        msgDiv.appendChild(buildSpeakButton(text));
        msgDiv.appendChild(buildReactionBar());
    }

    chatContainer.appendChild(msgDiv);

    // Read new replies aloud when voice mode is on.
    if (sender === 'bot' && voiceEnabled && !silent) speak(text);

    scrollToBottom();
}

/**
 * A small row of reactions under a reply. Picking one is one-way: it updates the
 * stored reaction, she notices it on the next turn, and a different choice just
 * replaces it.
 */
/**
 * Render a reply, giving any "quoted" span its own block so songs, shayari and
 * bhajan lines read as verse instead of running into the prose.
 *
 * Built from text nodes only — model output is never parsed as HTML.
 */
function fillBubbleText(container, text) {
    container.replaceChildren();
    renderTextWithVerse(container, text);
}

function renderTextWithVerse(container, text) {
    const value = String(text ?? '');
    const pattern = /"([^"]+)"/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(value)) !== null) {
        if (match.index > cursor) {
            container.appendChild(document.createTextNode(value.slice(cursor, match.index)));
        }

        const verse = document.createElement('span');
        verse.className = 'verse';
        verse.textContent = match[1];
        container.appendChild(verse);

        cursor = pattern.lastIndex;
    }

    if (cursor < value.length) {
        container.appendChild(document.createTextNode(value.slice(cursor)));
    }
}

function buildReactionBar() {
    const bar = document.createElement('div');
    bar.className = 'reaction-bar';

    for (const emoji of REACTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reaction-btn';
        btn.textContent = emoji;
        btn.setAttribute('aria-label', `React with ${emoji}`);
        btn.addEventListener('click', () => reactWith(emoji, bar));
        bar.appendChild(btn);
    }

    return bar;
}

function reactWith(emoji, bar) {
    memory.lastReaction = emoji;
    saveMemory();

    for (const btn of bar.querySelectorAll('.reaction-btn')) {
        btn.classList.toggle('is-picked', btn.textContent === emoji);
    }
}

function buildSpeakButton(text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'speak-btn';
    button.setAttribute('aria-label', 'Play this reply aloud');
    button.textContent = '\u25B6';
    button.addEventListener('click', () => speak(text, button));
    return button;
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
