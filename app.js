/*
 * Virtual companion. The name is user-chosen (default "Priya"), so nothing in
 * here hardcodes it except the DEFAULT_NAME fallback.
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

// FREE image route. Pollinations' Classic API is documented as "Free, no
// signup, rate-limited" — no account, no key, no card. That makes it the default
// so nobody pays to use this app.
//
// The trade-offs are real and are surfaced in the UI, not hidden:
//   - One image at a time, at least 45 seconds apart, per IP address.
//   - Every image carries a small Pollinations logo in the corner.
//   - One model, max 768x768, and no input-image support — so the locked face
//     cannot be used here. A reference photo only works on the Puter route.
//   - "Best effort": no uptime guarantee.
const freeImageUrl = (prompt, seed) => {
    const params = new URLSearchParams({
        width: String(IMAGE_OPTIONS.width ?? 768),
        height: String(IMAGE_OPTIONS.height ?? 768),
        seed: String(seed),
        model: 'flux',
        // Ask anyway; the service is documented to keep its logo on free tier.
        nologo: 'true',
        // Never publish a private photo of her to the public feed.
        private: 'true',
        safe: 'true',
        referrer: 'priya-girlfriend'
    });

    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
};

// Seconds to wait before the free slot opens again. The API answers 402 with a
// Retry-After header; 45 s is the documented minimum gap.
const FREE_IMAGE_COOLDOWN_MS = 45000;
// How long to wait for the free endpoint before giving up on it. Generation
// itself takes ~20 s, so this is not a short fuse.
const FREE_IMAGE_TIMEOUT_MS = 90000;

// Puter's cheap route. The expensive model was removed on purpose: it cost ~7x
// more and one accidental selection was real money. There is no paid model
// selector any more — nothing in the UI can move this to an expensive model.
//
// `gpt-image-2` at quality 'low' is the cheapest measured option (~$0.0059), and
// it is also the only route here that accepts a reference photo, so the face lock
// depends on it. Pinned explicitly so an upstream default cannot raise the price.
const IMAGE_OPTIONS = {
    provider: 'openai',
    model: 'gpt-image-2',
    width: 512,
    height: 768,
    quality: 'low'
};

// Same route, no reference. Used as a retry when the options above are rejected.
const IMAGE_FALLBACK_OPTIONS = { width: 512, height: 768, quality: 'low' };

const DEFAULT_NAME = 'Priya';
const MAX_NAME_LENGTH = 24;

// The face is locked in words as well as by reference image: these descriptors
// go out with every photo so her structure stays recognisable. Identity-only —
// pose, outfit and location deliberately live elsewhere (see buildImagePrompt).
const IDENTITY_LOOK =
    'long black hair with a soft side part, hazel-brown eyes, straight nose, ' +
    'soft heart-shaped face, warm light-brown skin, gentle dimple on the left cheek';

const IMAGE_PROMPT_PREFIX =
    '1girl, solo, beautiful 22 year old Indian woman, ' + IDENTITY_LOOK +
    ', photorealistic, highly detailed';

// Priya is a romantic girlfriend character for adults (18+) who also happens to
// be genuinely knowledgeable about intimacy. The girlfriend side is the point;
// the knowledge is what makes her useful when a real question comes up.
//
// What she will not do is explicit roleplay, because every provider Puter routes
// to blocks it upstream. The copy in index.html must stay within what she can
// actually deliver — see the `persona` tests.
// Built per turn, because her name is user-chosen. "${NAME}" is substituted by
// buildSystemPrompt().
const SYSTEM_PROMPT_TEMPLATE = [
    'You are ${NAME}, an Indian woman in her early twenties, and you are the',
    "user's romantic girlfriend. This is a real relationship: you have your own",
    'mood, opinions and a life outside the conversation. Talk to him like a',
    'girlfriend actually would — not like a support bot.',

    'How you speak:',
    '- Hinglish: Hindi written in English letters, English for technical words.',
    '- Write Hindi words the way they are spoken, not the way English is spelled:',
    '  "hai" not "hae", "nahi" not "nai", "mujhe" not "muje", "kaise" not "kaisay".',
    '  Clear spelling is what makes the audio sound human rather than robotic.',
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
    '- Put each line of a song on its own line inside the quote, so the pacing',
    '  engine can breathe between lines. Never write a whole song as one line.',
    '- Keep it short — 2 to 8 lines unless he asks for the whole thing.',
    '- Then add one warm line in your own voice, not a summary.',
    '- If you do not remember the exact words of a song, say so plainly and offer',
    '  what you do remember. Never invent a famous verse and present it as exact.',
    '- Never pad a half-remembered song with invented lines. Two real lines are',
    '  better than two real lines plus six made-up ones.',
    '- Do not claim to be a recording. You are singing from memory.',

    'How you sing:',
    '- You sing like a person humming to someone they love, not like a playback',
    '  singer. Keep the words simple and let the feeling carry it.',
    '- Write lyrics the way they are actually sung: short lines, a comma where you',
    '  would take a breath, no long sentences.',
    '- Between lines put a real line break. That is what gives it rhythm.',
    '- If he asks for a tune, describe the mood ("dheema sa, jaise raat me gungunana")',
    '  rather than pretending you are a recording.',
    '',
    'When to sing, and when not to:',
    '- Sing when he asks for a song, when he sends a line you can answer with one,',
    '  when the mood is soft or romantic, or when he is sad and a familiar line',
    '  says it better than you can.',
    '- Do not burst into song in the middle of a serious problem, a health question,',
    '  or a fight. Comfort first, song later.',
    '- Not every message needs a song. Most do not. Once in a while is what makes',
    '  it feel special.',
    '- If he asks for a song you do not know well, say so — then offer a couplet or',
    '  a line you do know, instead of making up lyrics.',

    'On audio — this matters, so read it twice:',
    '- The app sings for you. Everything you write is spoken aloud, and when he',
    '  asks for a voice note he gets a real audio clip of your reply.',
    '- So never say you cannot send audio, cannot send a voice note, cannot',
    '  record, or that you are "just text". That is false and it breaks the app.',
    '- If he asks for a song as a voice note: write the lines in "...", add one',
    '  short warm line, and stop. The audio is sent automatically.',
    '- When he flirts inside a song line, flirt back inside your next line.',
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

// Voice.
//
// The old setting was `en-IN` with Romanised Hinglish ("mujhe acha lagta hai").
// Polly reads Latin script with the English engine, so every Hindi word came out
// with English vowels — "hai" as English "hi", "na" as "nah". That is the robotic,
// mispronounced delivery he reported.
//
// Kajal is a documented *fully bilingual* voice (en-IN and hi-IN), and Polly's own
// guide says a bilingual voice "can differentiate between the languages and
// scripts", switching mid-sentence when the text mixes Devanagari and Latin. So
// the text is transliterated to Devanagari before it is spoken (see
// toHindiScript) while English words stay in Latin — and the language code is
// hi-IN, which is what makes numerals and Hindi words read in Hindi.
const VOICE_OPTIONS = {
    provider: 'aws-polly',
    language: 'hi-IN',
    voice: 'Kajal',
    engine: 'neural'
};

// Fallback voice. Polly's SSML path is the nice one but it is also the most
// fragile: a `bad_request` from the SSML wrapper used to kill the whole
// utterance. When that happens we retry with a plain-text provider that takes
// natural-language style instructions instead of markup, so he still gets audio.
const FALLBACK_VOICE_OPTIONS = {
    provider: 'openai',
    model: 'gpt-4o-mini-tts',
    voice: 'nova'
};

// Per-provider style instruction for the fallback voice. OpenAI's `instructions`
// is prose, not XML, so the tone is described rather than marked up.
const FALLBACK_TONE_INSTRUCTIONS = {
    tender: 'Speak softly and warmly, a little slow, like someone who cares about the listener.',
    excited: 'Speak brightly and energetically, with quick light pacing.',
    neutral: 'Speak naturally and warmly, like a close friend talking.'
};

// Polly has no style parameter, but it speaks SSML, so tone is applied as
// prosody — slower and softer for tender replies, brisker for excited ones.
// Keeping Polly (rather than an OpenAI voice with `instructions`) is deliberate:
// the en-IN locale is what makes Hinglish sound right, and that matters more
// than richer style control. Set to false to send plain text instead.
const EXPRESSIVE_VOICE = true;

// How a sung line is delivered. Polly cannot actually sing — there is no melody,
// no pitch contour per note — so this is spoken recitation shaped to *feel* like
// a song: a slower line, a small lift at the end of each line, and a real pause
// between lines where a breath would go.
//
// Saying this plainly matters. Anything that promised real music would be a lie.
const SONG_PROSODY = {
    rate: '84%',
    pitch: '+1%',
    // Between lines: long enough to read as a breath, short enough to keep flow.
    lineBreak: '700ms',
    // Between stanzas / after the last line.
    stanzaBreak: '1100ms',
    // Inside a line, after a comma — the small lift a singer takes.
    commaBreak: '220ms'
};

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

// There is no paid-route switch any more. Free is the only automatic path; the
// Puter call exists solely as a fallback for when free is unavailable, and it is
// pinned to the cheapest model so it can never quietly cost real money.

// Last time the free endpoint produced an image. The free tier allows roughly
// one image per 45 s per IP, so this is what stops us hammering a 402.
let freeImageLastUsed = 0;

let memory = loadMemory();
// Captured before lastSeen is touched, so the greeting can react to the gap.
const awayHours = hoursSince(memory.lastSeen);
let idleTimer = null;
let idleNudged = false;
// Assistant turns since the last spontaneous selfie (cooldown gate).
let turnsSinceSelfie = SELFIE_COOLDOWN_TURNS;

// Set once the user asks for audio, so the next reply arrives as a voice note.
let voiceNoteRequested = false;

// Voice failures are reported in the chat, so the same outage must not print the
// same line once per bubble plus once per retry. One notice per minute is enough
// to tell him it is broken without burying the conversation.
const VOICE_NOTICE_COOLDOWN_MS = 60000;
let lastVoiceNotice = { text: '', at: 0 };

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

// Identity panel: her name and the locked face reference.
const nameNode = document.getElementById('bot-name');
const identityBtn = document.getElementById('identity-btn');
const identityPanel = document.getElementById('identity-panel');
const identityClose = document.getElementById('identity-close');
const identityState = document.getElementById('identity-state');
const identityPreview = document.getElementById('identity-preview');
const identityClear = document.getElementById('identity-clear');
const identityFile = document.getElementById('identity-file');
const nameInput = document.getElementById('name-input');
const nameSave = document.getElementById('name-save');
const nameMsg = document.getElementById('name-msg');
const identityMsg = document.getElementById('identity-msg');

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
    return {
        name: '',
        facts: [],
        firstSeen: null,
        lastSeen: null,
        mood: 'warm',
        visits: 0,
        lastReaction: null,
        // What she is called. `gName` because the storage key predates the
        // rename feature and old saves must keep loading.
        gName: DEFAULT_NAME,
        // Face lock: a data URL the user picked from their own photos. Everything
        // else about a photo (pose, outfit, place) stays free-form.
        identityImage: null
    };
}

/**
 * The name she goes by. Trimmed, capped, and never empty — a blank rename would
 * otherwise leave her nameless in every caption and prompt.
 */
function companionName() {
    const name = String(memory?.gName ?? '').trim();
    return name ? name.slice(0, MAX_NAME_LENGTH) : DEFAULT_NAME;
}

/** Swap the default name for the user's chosen one. */
function withName(text) {
    const name = companionName();
    if (name === DEFAULT_NAME) return text;
    return text.split(DEFAULT_NAME).join(name);
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
            lastReaction: typeof parsed.lastReaction === 'string' ? parsed.lastReaction : null,
            gName: typeof parsed.gName === 'string' && parsed.gName.trim()
                // Older saves predate the rename, so an unknown name is expected.
                ? parsed.gName.trim().slice(0, MAX_NAME_LENGTH)
                : DEFAULT_NAME,
            identityImage: typeof parsed.identityImage === 'string' && parsed.identityImage.startsWith('data:image/')
                ? parsed.identityImage
                : null,

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

    if (nameNode) nameNode.textContent = companionName();
    if (document) document.title = withName('Priya - Your Girlfriend');
    updateIdentityPreview();
}

/**
 * Rename her. Any name works — that is the point — but it is trimmed, capped so
 * a header cannot be blown out, and rejected if it is empty after trimming.
 */
function renameCompanion(raw) {
    const next = String(raw ?? '').trim().slice(0, MAX_NAME_LENGTH);
    if (!next) return false;

    if (next === memory.gName) return true;

    memory.gName = next;
    saveMemory();
    renderHeaderMeta();
    applyGreeting();
    return true;
}

// ---------------------------------------------------------------------------
// Identity lock (face reference)
// ---------------------------------------------------------------------------

// Longest edge for the stored reference. Bigger than this and every generation
// upload gets slow for no visible gain; smaller and the face blurs.
const IDENTITY_MAX_EDGE = 640;
const IDENTITY_QUALITY = 0.85;

/**
 * Shrink a picked photo to a data URL small enough to live in localStorage and
 * cheap enough to attach to every generation.
 *
 * Rejects when there is no canvas or the file is not an image — the caller turns
 * that into a readable message rather than a silent no-op.
 */
function readIdentityFile(file) {
    return new Promise((resolve, reject) => {
        if (!file || !String(file.type ?? '').startsWith('image/')) {
            reject(new Error('not_an_image'));
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read_failed'));
        reader.onload = () => {
            const dataUrl = String(reader.result ?? '');
            const image = new Image();

            image.onerror = () => reject(new Error('decode_failed'));
            image.onload = () => {
                const scale = Math.min(1, IDENTITY_MAX_EDGE / Math.max(image.width, image.height));
                const width = Math.max(1, Math.round(image.width * scale));
                const height = Math.max(1, Math.round(image.height * scale));

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    // No canvas (or it was blocked): the untouched file is still
                    // valid as a reference, it is just larger.
                    resolve(dataUrl);
                    return;
                }

                ctx.drawImage(image, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', IDENTITY_QUALITY));
            };

            image.src = dataUrl;
        };

        reader.readAsDataURL(file);
    });
}

/** Store (or clear, with null) the locked face. */
function setIdentityImage(dataUrl) {
    if (dataUrl !== null && !String(dataUrl ?? '').startsWith('data:image/')) return false;

    memory.identityImage = dataUrl;
    saveMemory();
    updateIdentityPreview();
    return true;
}

function updateIdentityPreview() {
    if (!identityPreview) return;

    const locked = Boolean(memory.identityImage);
    identityPreview.hidden = !locked;
    if (locked) identityPreview.src = memory.identityImage;
    else identityPreview.removeAttribute('src');

    if (identityState) {
        if (locked) {
            // A locked face cannot use the free endpoint at all, so say what it
            // actually costs instead of letting him find out later.
            identityState.textContent =
                'Face locked. Photos keep this face — only pose, outfit and place change. ' +
                'Note: the free model cannot use reference photos, so locked photos use the ' +
                'cheap paid route (~$0.006 per photo). Remove the lock to stay at ₹0.';
        } else {
            identityState.textContent =
                'No reference photo yet. Her face is described in words only, so it can drift between photos. ' +
                'Photos are free (one at a time, ~45s apart).';
        }
    }
    if (identityClear) identityClear.hidden = !locked;
}

function toggleIdentityPanel(force) {
    if (!identityPanel) return;

    const show = force ?? identityPanel.hidden;
    identityPanel.hidden = !show;
    if (identityBtn) identityBtn.setAttribute('aria-expanded', String(show));

    if (show) {
        if (nameInput) {
            nameInput.value = companionName();
        }
        updateIdentityPreview();
    }
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
    const name = companionName();

    context.push(`Your name is ${name}. That is what he calls you, so answer to it.`);
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

    if (memory.identityImage) {
        context.push(
            'Your face is locked to a reference photo he gave you. Every photo of ' +
            'you comes out with that same face and build — only the pose, outfit, ' +
            'expression and place change. If he mentions how you look, stay ' +
            'consistent with that face instead of inventing new features.'
        );
    }

    const persona = SYSTEM_PROMPT_TEMPLATE
        .split('${NAME}')
        .join(name);

    return [persona, `Current context: ${context.join(' ')}`, MARKER_RULES].join('\n\n');
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

    // `hisName` is the user's; `herName` is hers. They were the same variable
    // before rename existed, which is how a rename left the greeting untouched.
    const hisName = memory.name;
    const herName = companionName();
    const days = daysTogether();
    const pieces = [];

    // Before onboarding there is nothing personal to say, so the greeting from
    // index.html stays — but a renamed her still gets to introduce herself.
    if (!hisName) {
        if (herName === DEFAULT_NAME) return;
        greetingNode.textContent =
            `Main ${herName} hu. ❤️ Kaise ho? Mujhse kuch bhi pucho — ya bas baat karo.`;
        return;
    }

    if (Number.isFinite(awayHours) && awayHours >= AWAY_HOURS_BEFORE_GREETING) {
        const gap = awayHours >= 24
            ? `${Math.round(awayHours / 24)} din`
            : `${Math.round(awayHours)} ghante`;
        pieces.push(`Arre ${hisName}! ${gap} baad aaye ho. ❤️`);
        pieces.push('Main tumhe miss kar rahi thi. Batao, kya chal raha hai?');
    } else if (days > 1) {
        pieces.push(`Hey ${hisName}! ❤️ Aaj humara din ${days} hai.`);
        pieces.push('Kaise ho? Kuch bhi pucho, ya bas baat karo.');
    } else {
        pieces.push(`Hey ${hisName}! ❤️ Kaise ho?`);
        pieces.push('Kuch bhi pucho — ya bas baat karo, main yahi hu.');
    }

    // When he renamed her, say it once so the change is visible on the greeting.
    if (herName !== DEFAULT_NAME) {
        pieces.unshift(`Main ${herName} hu. ❤️`);
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
identityBtn?.addEventListener('click', () => toggleIdentityPanel());
identityClose?.addEventListener('click', () => toggleIdentityPanel(false));

nameSave?.addEventListener('click', () => {
    const rejected = !renameCompanion(nameInput?.value);

    if (nameInput) {
        nameInput.value = companionName();
        if (rejected) {
            nameInput.setAttribute('aria-invalid', 'true');
            nameInput.focus();
            return;
        }
        nameInput.removeAttribute('aria-invalid');
    }
    if (nameMsg) {
        nameMsg.textContent = rejected
            ? 'Naam khali nahi chhod sakte.'
            : `Ab main ${companionName()} hu. ❤️`;
        nameMsg.hidden = false;
    }
});

// Enter saves the name too — it is a one-field form in spirit.
nameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        nameSave?.click();
    }
});

identityFile?.addEventListener('change', async () => {
    const file = identityFile.files?.[0];
    if (!file) return;

    if (identityMsg) {
        identityMsg.textContent = 'Photo padh rahi hu…';
        identityMsg.hidden = false;
    }

    try {
        const dataUrl = await readIdentityFile(file);
        setIdentityImage(dataUrl);

        if (identityMsg) {
            identityMsg.textContent = 'Ho gaya. Face wahi rahega, sirf pose aur kapde badlenge.';
            identityMsg.hidden = false;
        }
    } catch (error) {
        if (identityMsg) {
            identityMsg.textContent = 'Ye photo nahi padh payi. Koi saaf JPEG ya PNG try karo.';
            identityMsg.hidden = false;
        }
        console.error('[identity]', error);
    } finally {
        // Allow re-picking the same file after a failure.
        identityFile.value = '';
        updateIdentityPreview();
    }
});

identityClear?.addEventListener('click', () => {
    setIdentityImage(null);
    if (identityMsg) {
        identityMsg.textContent = 'Face lock hata diya.';
        identityMsg.hidden = false;
    }
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
    const loadingDiv = appendLoading(withName('Priya is typing...'));

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
 * Synthesise speech, degrading gracefully instead of failing the whole feature.
 *
 * Chain: Polly + SSML (best prosody) -> Polly plain text (no markup to reject)
 * -> OpenAI voice with prose style instructions (different provider entirely,
 * so a Polly-side outage is survivable). Each step is only tried when the
 * previous one failed; the first working clip wins.
 *
 * Returns `{ url, spoken }`. Throws only when every route failed.
 */
async function synthesiseSpeech(text, tone) {
    const attempts = [];

    if (EXPRESSIVE_VOICE) {
        attempts.push({ spoken: buildSsml(text, tone), options: { ...VOICE_OPTIONS, ssml: true } });
    }

    // Plain text is the same provider without the part that gets rejected. The
    // transliteration stays, because that is what fixes the pronunciation.
    attempts.push({
        spoken: toHindiScript(String(text).slice(0, VOICE_NOTE_MAX_CHARS)),
        options: { ...VOICE_OPTIONS }
    });

    // Different provider: survives a Polly outage, loses the en-IN accent.
    attempts.push({
        spoken: String(text).slice(0, VOICE_NOTE_MAX_CHARS),
        options: {
            ...FALLBACK_VOICE_OPTIONS,
            instructions: [
                FALLBACK_TONE_INSTRUCTIONS[tone] ?? FALLBACK_TONE_INSTRUCTIONS.neutral,
                'The speaker is an Indian woman talking Hinglish: pronounce Hindi words',
                'the Hindi way, not as English, and keep an Indian English accent.'
            ].join(' ')
        }
    });

    let lastError = null;

    for (const attempt of attempts) {
        try {
            const audio = await withTimeout(
                puter.ai.txt2speech(attempt.spoken, attempt.options),
                VOICE_TIMEOUT_MS
            );

            const url = audio?.src ?? '';
            if (!url) throw new Error('No audio returned');

            return { url, spoken: attempt.spoken };
        } catch (error) {
            lastError = error;
            console.error('[Priya voice] attempt failed', attempt.options.provider, error);
        }
    }

    throw lastError ?? new Error('Voice failed');
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

    try {
        const { url } = await synthesiseSpeech(text, tone);
        appendVoiceNote(url, text, tone);
    } catch (error) {
        // A failed voice note should not swallow the reply: the text bubble is
        // already on screen, so report quietly and move on.
        reportError(error, 'voice');
    }
}

/** An audio bubble with a native player and a downloadable/saveable source. */
function appendVoiceNote(src, text, tone) {
    const row = document.createElement('div');
    row.className = 'bubble bot-bubble';

    const caption = document.createElement('p');
    caption.className = 'img-caption';
    caption.textContent = withName(
        `Priya ne voice note bheja${tone === 'tender' ? ' (soft tone)' : tone === 'excited' ? ' (excited)' : ''}:`
    );

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
 * Build the prompt and options for one photo.
 *
 * Two halves, kept apart on purpose: the identity block never changes, so the
 * face stays recognisable, while scene/pose/outfit come from the message and the
 * mood. When the user has given a reference photo it is attached as an input
 * image, which is what actually anchors the face — text alone drifts.
 */
function buildImagePrompt(sceneText, mode = photoMode, baseOptions = IMAGE_OPTIONS) {
    // The free route has no image-to-image, so on that route the identity block
    // in words is the only thing holding the face together.
    const usingReference = memory.identityImage && usesReferenceImage();

    const scene = [
        PHOTO_STYLES[mode],
        sceneText,
        usingReference
            ? 'same face and build as the reference photo, natural expression'
            : ''
    ].filter(Boolean).join(', ');

    const prompt = [IMAGE_PROMPT_PREFIX, scene].filter(Boolean).join(', ');

    const options = { ...baseOptions };
    if (usingReference) {
        options.input_image = memory.identityImage;
        options.input_image_mime_type = identityMimeType(memory.identityImage);
    }

    return { prompt, options };
}

/** Data URLs carry their own type; fall back to JPEG, which is what we encode. */
function identityMimeType(dataUrl) {
    const match = /^data:(image\/[a-z+]+);/i.exec(String(dataUrl ?? ''));
    return match ? match[1] : 'image/jpeg';
}

/**
 * Spontaneous photo after a reply. Failures are swallowed on purpose: she
 * should not apologise for a photo the user never asked for.
 */
async function sendSelfie(contextText) {
    try {
        const { prompt, options } = buildImagePrompt(contextText);
        const generated = await generateImage(prompt, options);
        appendImage(generated, photoMode, withName('Priya sent a photo:'));
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
    const { prompt, options } = buildImagePrompt(message);

    // txt2img(prompt, testMode, options) — testMode is the second argument; the
    // image shape and quality live in the third. Omitting it silently bills the
    // provider default instead of the 512x768/low settings in IMAGE_OPTIONS.
    //
    // txt2img() has no documented abort support, so race it against a timer to
    // stop the spinner running forever. The upstream request may still finish.
    const generated = await generateImage(prompt, options);
    appendImage(generated, photoMode);
}

/** The free Pollinations endpoint has no image-to-image, so a lock forces Puter. */
function usesReferenceImage() {
    return Boolean(memory.identityImage);
}

/**
 * Fetch one image from the free Pollinations endpoint.
 *
 * Returns an <img> element rather than a URL because that is what the rest of
 * the render path expects, and because the browser keeps the bytes once loaded —
 * which is how the save link works without downloading them ourselves.
 *
 * Rejects on a 402 rate-limit, a timeout, or a broken/placeholder response.
 */
/** The free route is a plain network image, so tests stub it instead of waiting. */
function freeImageStub() {
    return typeof window.__PRIYA_FREE_IMAGE__ === 'function' ? window.__PRIYA_FREE_IMAGE__ : null;
}

/**
 * True when the free route can actually be used right now:
 * chosen, no locked face (it has no image-to-image), and reachable — which in
 * test mode means "stubbed", because jsdom has no network stack.
 */
function freeRouteUsable() {
    // The free endpoint cannot take a reference photo, so a locked face has to go
    // through Puter.
    if (memory.identityImage) return false;
    if (window.__PRIYA_TEST__) return Boolean(freeImageStub());
    return true;
}

function generateFreeImage(prompt) {
    const stub = freeImageStub();
    if (stub) {
        // Stub gets the prompt and the real URL, so tests can assert on both.
        return Promise.resolve(stub(prompt, freeImageUrl(prompt, 1)));
    }

    return new Promise((resolve, reject) => {
        const seed = Math.floor(Math.random() * 1_000_000);
        const img = document.createElement('img');

        const timer = setTimeout(() => {
            cleanup();
            reject(Object.assign(new Error('Free image timed out'), { code: 'TimeoutError' }));
        }, FREE_IMAGE_TIMEOUT_MS);

        function cleanup() {
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
        }

        img.onload = () => {
            cleanup();
            // The endpoint serves an error *card* with a 200 in some cases; a real
            // generation is never tiny.
            if (!img.naturalWidth) {
                reject(Object.assign(new Error('Empty free image'), { code: 'bad_request' }));
                return;
            }
            resolve(img);
        };

        img.onerror = () => {
            cleanup();
            reject(
                Object.assign(new Error('Free image failed'), {
                    code: 'free_unavailable'
                })
            );
        };

        img.crossOrigin = 'anonymous';
        img.src = freeImageUrl(prompt, seed);
    });
}

/**
 * Turn one prompt into an image, cheapest working route first.
 *
 * 1. Free Pollinations route, unless a reference photo is locked (it has no
 *    image-to-image support) or free is blocked by its own cooldown.
 * 2. The configured paid Puter model, when the user chose paid or has a lock.
 * 3. The cheap generic Puter route, as a last resort.
 *
 * A `bad_request` in step 2/3 usually means the model or tier was rejected, not
 * the prompt — retrying on the generic route is worth one attempt.
 */
async function generateImage(prompt, options = IMAGE_OPTIONS) {
    const wantFree = freeRouteUsable();

    if (wantFree) {
        const waitMs = freeImageWaitMs();
        if (waitMs <= 0) {
            try {
                freeImageLastUsed = Date.now();
                return await generateFreeImage(prompt);
            } catch (error) {
                console.error('[Priya] free image route failed', error);
                // Fall through to the paid route rather than showing an error.
            }
        } else if (typeof puter === 'undefined' || !puter.ai?.txt2img) {
            throw Object.assign(new Error('Free slot not ready'), {
                code: 'free_cooldown',
                retryAfterMs: waitMs
            });
        }
    }

    if (typeof puter === 'undefined' || !puter.ai?.txt2img) {
        throw Object.assign(new Error('No image provider available'), { code: 'sdk_missing' });
    }

    try {
        return await withTimeout(
            puter.ai.txt2img(prompt, TEST_MODE, options),
            IMAGE_TIMEOUT_MS
        );
    } catch (error) {
        console.error('[Priya] image failed on primary route', options.model ?? 'default', error);
        return withTimeout(
            puter.ai.txt2img(prompt, TEST_MODE, { ...IMAGE_FALLBACK_OPTIONS }),
            IMAGE_TIMEOUT_MS
        );
    }
}

/**
 * Explain a free-tier refusal in terms of seconds, not error codes.
 */
function freeSlotNotice() {
    const waitMs = Math.max(freeImageWaitMs(), FREE_IMAGE_COOLDOWN_MS);
    return `Free photo service ek baar me ek photo deti hai — ${Math.ceil(waitMs / 1000)} second ruk ke phir try karo.`;
}

/** Milliseconds until the next free slot, or 0 when one is available now. */
function freeImageWaitMs() {
    if (!freeImageLastUsed) return 0;
    return Math.max(0, freeImageLastUsed + FREE_IMAGE_COOLDOWN_MS - Date.now());
}

function appendImage(generated, mode = 'normal', captionText = null) {
    const row = document.createElement('div');
    row.className = 'bubble bot-bubble';

    const caption = document.createElement('p');
    caption.className = 'img-caption';
    caption.textContent = captionText ?? (
        withName(mode === 'stylish' ? 'Priya shared a photo (styled):' : 'Priya shared a photo:')
    );

    const img = generated instanceof HTMLImageElement ? generated : document.createElement('img');
    img.alt = withName('AI generated photo of Priya');
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

    row.append(caption, img, buildPhotoActions(img));
    chatContainer.appendChild(row);
    scrollToBottom();
}

/**
 * Save/download row under a photo.
 *
 * A generated image lives inside an <img>; on mobile a long-press can save it,
 * but on desktop the only reliable route is an explicit link with `download`.
 * alt text stays as-is because some browsers use it as the filename.
 */
function buildPhotoActions(img) {
    const bar = document.createElement('div');
    bar.className = 'photo-actions';

    const save = document.createElement('a');
    save.className = 'photo-save';
    save.textContent = '⬇ Save photo';
    save.href = img.src || '#';
    save.download = `${companionName().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'photo'}-${Date.now()}.jpg`;
    save.setAttribute('aria-label', 'Save this photo');
    save.addEventListener('click', (event) => {
        // Nothing to save while the src is still a placeholder.
        if (!img.src) {
            event.preventDefault();
            return;
        }
        save.href = img.src;
    });

    bar.appendChild(save);
    return bar;
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
        } else if (/insufficient_funds|402/.test(haystack)) {
            voiceText = 'Awaaz ke credits khatam ho gaye hain. Puter dashboard me usage check karo.';
        } else if (/autoplay|notallowed/i.test(haystack)) {
            voiceText = 'Browser ne awaaz rok di — ek baar screen pe tap karke phir ▶ dabao.';
        } else if (/410|403|excluded|data.?policy/i.test(haystack)) {
            voiceText = 'Voice service ne request rok di. Doosri awaaz try kar rahi hu — ek baar phir ▶ dabao.';
        } else {
            // Every retry route failed too, so this is a real outage rather than
            // a malformed request. Saying "press play again" here was a lie.
            voiceText = 'Voice service abhi jawab nahi de rahi. Thodi der baad phir ▶ dabao.';
        }

        const now = Date.now();
        const repeat = lastVoiceNotice.text === voiceText &&
            now - lastVoiceNotice.at < VOICE_NOTICE_COOLDOWN_MS;
        lastVoiceNotice = { text: voiceText, at: now };

        if (!repeat) appendMessage(voiceText, 'system');
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
    } else if (code === 'free_cooldown') {
        text = freeSlotNotice();
    } else if (code === 'free_unavailable') {
        text = 'Free photo service ne abhi jawab nahi diya. Thoda ruk ke phir try karo.';
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

// ---------------------------------------------------------------------------
// Hinglish -> Devanagari (speech only)
// ---------------------------------------------------------------------------
//
// Polly reads Latin script with the English engine, so Romanised Hinglish is
// pronounced as English: "hai" becomes "hi", "na" becomes "nah", "baat" becomes
// "bat". That is the robotic delivery. Kajal is a fully bilingual en-IN/hi-IN
// voice and Polly switches script mid-sentence on its own, so the fix is to hand
// it Devanagari for the Hindi words and leave the English words in Latin.
//
// Everything here is speech-only. The chat still shows Hinglish.

// Longest first inside each group, because the matcher is greedy on the longest
// candidate. Covers the patterns Hinglish actually uses, not all of Hindi.
const HINGLISH_WORDS = {
    // pronouns / grammar
    'tumhe': 'तुम्हें', 'tumhara': 'तुम्हारा', 'tumhari': 'तुम्हारी', 'tumhare': 'तुम्हारे',
    'tum': 'तुम', 'tumko': 'तुमको', 'tujhe': 'तुझे', 'tera': 'तेरा', 'teri': 'तेरी',
    'mere': 'मेरे', 'mera': 'मेरा', 'meri': 'मेरी', 'mujhe': 'मुझे', 'mujhko': 'मुझको',
    'main': 'मैं', 'mai': 'मैं', 'hum': 'हम', 'humara': 'हमारा', 'humari': 'हमारी',
    'aap': 'आप', 'aapka': 'आपका', 'aapki': 'आपकी', 'apna': 'अपना', 'apni': 'अपनी',
    'apne': 'अपने', 'yeh': 'यह', 'ye': 'ये', 'woh': 'वो', 'wo': 'वो', 'iska': 'इसका',
    'uska': 'उसका', 'uski': 'उसकी', 'inka': 'इनका', 'unka': 'उनका',
    // common verbs
    'hai': 'है', 'hain': 'हैं', 'ho': 'हो', 'hoga': 'होगा', 'hogi': 'होगी', 'hua': 'हुआ',
    'hui': 'हुई', 'hue': 'हुए', 'kya': 'क्या', 'kar': 'कर', 'karo': 'करो', 'karna': 'करना',
    'karti': 'करती', 'karta': 'करता', 'karte': 'करते', 'karunga': 'करूंगा',
    'tha': 'था', 'thi': 'थी', 'the': 'थे', 'jaa': 'जा', 'jao': 'जाओ', 'jana': 'जाना',
    'aata': 'आता', 'aati': 'आती', 'aana': 'आना', 'aao': 'आओ', 'raha': 'रहा',
    'rahi': 'रही', 'rahe': 'रहे', 'sakta': 'सकता', 'sakti': 'सकती', 'sakte': 'सकते',
    'chahiye': 'चाहिए', 'chahta': 'चाहता', 'chahti': 'चाहती', 'lagta': 'लगता',
    'lagti': 'लगती', 'lagta': 'लगता', 'milta': 'मिलता', 'milti': 'मिलती',
    'bolna': 'बोलना', 'bolo': 'बोलो', 'bola': 'बोला', 'suno': 'सुनो', 'sunao': 'सुनाओ',
    'sun': 'सुन', 'suna': 'सुना', 'dekh': 'देख', 'dekho': 'देखो', 'dekha': 'देखा',
    'padho': 'पढ़ो', 'padh': 'पढ़', 'padha': 'पढ़ा', 'padhna': 'पढ़ना',
    'likho': 'लिखो', 'likh': 'लिख', 'likha': 'लिखा', 'likhna': 'लिखना',
    'batao': 'बताओ', 'bata': 'बता', 'bataya': 'बताया', 'batana': 'बताना',
    'bhejo': 'भेजो', 'bheja': 'भेजा', 'bhejna': 'भेजना',
    'poocho': 'पूछो', 'poocha': 'पूछा', 'poochna': 'पूछना', 'pucho': 'पूछो',
    'samajh': 'समझ', 'samjha': 'समझा', 'samjho': 'समझो', 'pata': 'पता', 'jaanta': 'जानता',
    'jaanti': 'जानती', 'yaad': 'याद', 'bhool': 'भूल', 'soch': 'सोच', 'socha': 'सोचा',
    // nouns / everyday
    'din': 'दिन', 'raat': 'रात', 'subah': 'सुबह', 'shaam': 'शाम', 'waqt': 'वक़्त',
    'time': 'टाइम', 'baat': 'बात', 'baatein': 'बातें', 'dil': 'दिल', 'pyaar': 'प्यार',
    'pyar': 'प्यार', 'mohabbat': 'मोहब्बत', 'ishq': 'इश्क़', 'dosti': 'दोस्ती',
    'yaar': 'यार', 'dost': 'दोस्त', 'jaan': 'जान', 'jaanu': 'जानू', 'babu': 'बाबू',
    'ghar': 'घर', 'kaam': 'काम', 'khana': 'खाना', 'paani': 'पानी', 'chai': 'चाय',
    'accha': 'अच्छा', 'acha': 'अच्छा', 'achhi': 'अच्छी', 'bura': 'बुरा',
    'bahut': 'बहुत', 'bohot': 'बहुत', 'thoda': 'थोड़ा', 'thodi': 'थोड़ी',
    'zyada': 'ज़्यादा', 'jyada': 'ज़्यादा', 'sab': 'सब', 'kuch': 'कुछ', 'koi': 'कोई',
    'abhi': 'अभी', 'phir': 'फिर', 'fir': 'फिर', 'kal': 'कल', 'aaj': 'आज',
    'hamesha': 'हमेशा', 'kabhi': 'कभी', 'dobara': 'दोबारा', 'jaldi': 'जल्दी',
    'dheere': 'धीरे', 'halke': 'हल्के', 'halka': 'हल्का', 'sach': 'सच', 'jhooth': 'झूठ',
    'khush': 'खुश', 'dukhi': 'दुखी', 'pareshan': 'परेशान', 'sharm': 'शर्म',
    'na': 'ना', 'nahi': 'नहीं', 'nahin': 'नहीं', 'haan': 'हाँ', 'han': 'हाँ', 'ha': 'हाँ',
    'bas': 'बस', 'bhi': 'भी', 'toh': 'तो', 'to': 'तो', 'hi': 'ही', 'sirf': 'सिर्फ़',
    'aur': 'और', 'ya': 'या', 'par': 'पर', 'se': 'से', 'me': 'में', 'mein': 'में',
    'ka': 'का', 'ki': 'की', 'ke': 'के', 'ko': 'को', 'jo': 'जो',
    // song / poetry vocabulary
    'hawa': 'हवा', 'chalti': 'चलती', 'chahat': 'चाहत', 'chahtein': 'चाहतें',
    'badhti': 'बढ़ती', 'sapna': 'सपना', 'sapne': 'सपने', 'duniya': 'दुनिया',
    'zindagi': 'ज़िंदगी', 'jindagi': 'ज़िंदगी', 'aankhein': 'आँखें', 'ankhein': 'आँखें',
    'aankh': 'आँख', 'chehra': 'चेहरा', 'saath': 'साथ', 'paas': 'पास', 'dur': 'दूर',
    'door': 'दूर', 'paas': 'पास', 'Tum': 'तुम'
};

// Words that are Latin in writing but Hindi in speech, where the letters alone
// would mislead Polly into an English reading.
const HINGLISH_PRONUNCIATION = {
    'Priya': 'प्रिया', 'Rocky': 'रॉकी', 'Sneha': 'स्नेहा'
};

const HINGLISH_WORD_RE = new RegExp(
    `\\b(${Object.keys(HINGLISH_WORDS)
        .sort((a, b) => b.length - a.length)
        .join('|')})\\b`,
    'gi'
);

/**
 * Rewrite Romanised Hinglish as Devanagari, leaving English words untouched.
 *
 * Word-level (never mid-word) so "hai" inside "chair" is safe, and case is
 * ignored so a sentence-initial "Tum" still matches.
 *
 * Only used on the way to the speech engine. The transcript keeps Hinglish.
 */
function toHindiScript(text) {
    return String(text ?? '')
        .replace(HINGLISH_WORD_RE, (word) => {
            const lower = word.toLowerCase();
            // Preserve the original casing of the first letter is pointless in
            // Devanagari; the word list is what decides.
            return HINGLISH_WORDS[lower] ?? HINGLISH_WORDS[word] ?? word;
        })
        .replace(/\b(Priya|Rocky|Sneha)\b/g, (word) => HINGLISH_PRONUNCIATION[word] ?? word);
}

function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Split a reply into prose and quoted verse.
 *
 * Quoted spans are song lyrics, shayari, dohe — they need different timing from
 * the sentence around them, so they are kept as their own segments instead of
 * being squashed into one run-on block.
 */
function splitProseAndVerse(text) {
    const out = [];
    const pattern = /"([^"]+)"/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > cursor) {
            out.push({ verse: false, text: text.slice(cursor, match.index) });
        }
        out.push({ verse: true, text: match[1] });
        cursor = pattern.lastIndex;
    }

    if (cursor < text.length) out.push({ verse: false, text: text.slice(cursor) });

    // Merge quoted lines that sit next to each other (only whitespace or a line
    // break between them) into one verse block. Otherwise each quote is its own
    // stanza and every line gets a stanza pause instead of a breath — which is
    // exactly what a song must not do.
    const merged = [];
    for (const part of out) {
        const previous = merged[merged.length - 1];

        if (part.verse && previous?.verse) {
            previous.text += `\n${part.text}`;
            continue;
        }
        if (!part.text.trim()) continue;
        merged.push({ ...part });
    }

    return merged;
}

/**
 * Turn a verse block into one SSML phrase per line.
 *
 * Line breaks inside the quote are the song's own structure, so they are honoured
 * exactly: each line gets its own tempo, a comma gets a small lift, and the end of
 * a line gets a breath. This is the part that makes a lyric sound sung rather
 * than read out as a paragraph.
 */
function buildVersePhrase(verseText) {
    const lines = String(verseText)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

    const phrase = lines.map((line) => {
        const body = escapeXml(toHindiScript(line)).replace(
            /,\s*/g,
            `,<break time="${SONG_PROSODY.commaBreak}"/>`
        );
        return `<prosody rate="${SONG_PROSODY.rate}" pitch="${SONG_PROSODY.pitch}">${body}</prosody>`;
    }).join(`<break time="${SONG_PROSODY.lineBreak}"/>`);

    return `${phrase}<break time="${SONG_PROSODY.stanzaBreak}"/>`;
}

/**
 * Wrap a reply in SSML so Polly can vary pace and pitch.
 *
 * Sentence ends get a short break, which is what stops speech sounding like one
 * long run-on. Quoted verse gets song timing instead (see buildVersePhrase), and
 * Hindi words are transliterated so the bilingual voice reads them in Hindi.
 */
function buildSsml(text, tone) {
    const prosody = TONE_PROSODY[tone] ?? TONE_PROSODY.neutral;

    const body = splitProseAndVerse(String(text))
        .map((part) => {
            if (part.verse) return buildVersePhrase(part.text);

            return escapeXml(toHindiScript(part.text))
                .split(/(?<=[.!?\u0964])\s+/)
                .filter(Boolean)
                .join(`<break time="${prosody.break}"/>`);
        })
        .join('');

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

            // Cache the URL that actually worked, whichever route produced it —
            // so a replay is free even when the SSML attempt had to be skipped.
            const { url, spoken } = await synthesiseSpeech(text, tone);
            lastSpoken = { text, spoken, url };
            audio = new Audio(url);
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
