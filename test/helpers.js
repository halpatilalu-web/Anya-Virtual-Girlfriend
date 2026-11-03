import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const APP_SRC = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    // Strip the CDN script so tests never touch the network; a mock is injected.
    .replace(/<script src="https:\/\/js\.puter\.com\/v2\/"><\/script>/, '')
    .replace('<script src="app.js"></script>', '');

export const sleep = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Boot the real index.html + app.js in jsdom with a stubbed `puter` global.
 * `puterMock` receives the jsdom window so image mocks can create real <img> nodes.
 */
export function boot(puterMock = () => ({})) {
    const dom = new JSDOM(HTML, {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: 'http://localhost/'
    });

    const { window } = dom;

    // Disables the human typing delay and the idle nudge timer so the suite
    // stays fast and does not leave timers running between tests.
    window.__PRIYA_TEST__ = true;

    window.puter = puterMock(window);
    window.eval(APP_SRC);

    return {
        dom,
        window,
        document: window.document,
        $: (selector) => window.document.querySelector(selector),
        $$: (selector) => [...window.document.querySelectorAll(selector)],
        text: () => window.document.body.textContent,
        send: async (message) => {
            window.document.getElementById('user-input').value = message;
            window.document.getElementById('send-btn').click();
            await sleep();
        }
    };
}

/** A working stubbed SDK: records every call. */
export function spyPuter(overrides = {}) {
    const calls = { chat: [], txt2img: [], txt2speech: [] };

    return {
        calls,
        factory: (window) => ({
            ai: {
                chat: async (messages, options) => {
                    calls.chat.push({ messages, options });
                    return { message: { content: overrides.reply ?? 'Haan jaan ❤️' } };
                },
                txt2speech: async (text, options) => {
                    calls.txt2speech.push({ text, options });
                    // jsdom has no media pipeline; a plain object is enough for
                    // the app's src caching by hand.
                    const audio = window.document.createElement('audio');
                    audio.src = 'data:audio/mp3;base64,AAAA';
                    return audio;
                },
                txt2img: async (...args) => {
                    // txt2img(prompt, testMode) — capture the raw arguments so
                    // tests can assert on the cost-related flag.
                    calls.txt2img.push({ prompt: args[0], args: { testMode: args[1] } });
                    const img = window.document.createElement('img');
                    img.src = 'data:image/png;base64,iVBORw0KGgo=';
                    return img;
                }
            }
        })
    };
}
