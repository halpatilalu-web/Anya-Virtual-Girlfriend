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
    const calls = { chat: [], txt2img: [] };

    return {
        calls,
        factory: (window) => ({
            ai: {
                chat: async (messages, options) => {
                    calls.chat.push({ messages, options });
                    return { message: { content: overrides.reply ?? 'Haan jaan ❤️' } };
                },
                txt2img: async (prompt, options) => {
                    calls.txt2img.push({ prompt, options });
                    const img = window.document.createElement('img');
                    img.src = 'data:image/png;base64,iVBORw0KGgo=';
                    return img;
                }
            }
        })
    };
}
