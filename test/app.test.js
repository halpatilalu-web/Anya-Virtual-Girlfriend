import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { boot, spyPuter } from './helpers.js';

describe('image intent detection', () => {
    // The old substring matcher routed ~58% of ordinary Hinglish chat through
    // the image generator because "pic" is inside "epic", "topic", "picnic"...
    const shouldBeChat = [
        'mujhe ek epic story sunao',
        'yeh topic mujhe boring lagta hai',
        "I'm going to a picnic today",
        'usme kya spice hai',
        'I need to pick a dress',
        'mujhe purpose kya hai zindagi ka',
        'mera phone kharab ho gaya',
        'kal maine ek movie dekhi'
    ];

    for (const message of shouldBeChat) {
        it(`treats "${message}" as chat, not an image request`, async () => {
            const spy = spyPuter();
            const app = boot(spy.factory);
            await app.send(message);

            assert.equal(spy.calls.txt2img.length, 0, 'image generator should not run');
            assert.equal(spy.calls.chat.length, 1, 'chat should run instead');
        });
    }

    const shouldBeImage = [
        'apni photo bhejo',
        'aapki pic dikhao',
        'send me a selfie',
        'ek tasveer banao',
        'mujhe images chahiye'
    ];

    for (const message of shouldBeImage) {
        it(`treats "${message}" as an image request`, async () => {
            const spy = spyPuter();
            const app = boot(spy.factory);
            await app.send(message);

            assert.equal(spy.calls.txt2img.length, 1, 'image generator should run');
            assert.equal(spy.calls.chat.length, 0, 'chat should be skipped');
        });
    }
});

describe('chat', () => {
    it('renders the model reply', async () => {
        const spy = spyPuter({ reply: 'Haan jaan, bolo na ❤️' });
        const app = boot(spy.factory);
        await app.send('kaise ho');

        assert.ok(app.text().includes('Haan jaan, bolo na ❤️'));
    });

    it('sends the system prompt first and the model id', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('kaise ho');

        const { messages, options } = spy.calls.chat[0];
        assert.equal(messages[0].role, 'system');
        assert.match(messages[0].content, /Priya/);
        assert.equal(messages.at(-1).content, 'kaise ho');
        assert.equal(options.model, 'gpt-5.4-nano');
    });

    it('passes an AbortSignal so a hung request can be cancelled', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('hi');

        assert.ok(spy.calls.chat[0].options.signal, 'expected an AbortSignal');
    });

    it('replays earlier turns on the next request', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('pehla');
        await app.send('doosra');

        const second = spy.calls.chat[1].messages;
        assert.equal(second.length, 4, 'system + user + assistant + user');
        assert.equal(second[1].content, 'pehla');
        assert.equal(second[2].role, 'assistant');
    });

    it('caps history at 5 turns', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        for (let i = 1; i <= 8; i += 1) await app.send(`m${i}`);

        const users = spy.calls.chat.at(-1).messages.filter((m) => m.role === 'user');
        assert.equal(users.length, 6, '5 replayed turns + current message');
        assert.equal(users[0].content, 'm3', 'oldest turns dropped');
    });

    it('handles vendor-native array content blocks', async () => {
        const app = boot(() => ({
            ai: {
                chat: async () => ({
                    message: { content: [{ type: 'text', text: 'Array ' }, { type: 'text', text: 'reply' }] }
                }),
                txt2img: async () => null
            }
        }));
        await app.send('hello');

        assert.ok(app.text().includes('Array reply'));
    });

    it('ignores blank input', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('    ');

        assert.equal(spy.calls.chat.length, 0);
    });

    it('ignores a second send while the first is still in flight', async () => {
        let resolveFirst;
        const gate = new Promise((resolve) => { resolveFirst = resolve; });
        let calls = 0;

        const app = boot(() => ({
            ai: {
                chat: async () => {
                    calls += 1;
                    await gate;
                    return { message: { content: 'slow' } };
                },
                txt2img: async () => null
            }
        }));

        const button = app.document.getElementById('send-btn');
        app.document.getElementById('user-input').value = 'first';
        button.click();
        button.click();

        resolveFirst();
        await new Promise((r) => setTimeout(r, 80));

        assert.equal(calls, 1, 'only one request should reach the API');
    });
});

describe('images', () => {
    it('renders an image with the persona prompt prefix and dimensions', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('apni photo bhejo');

        const [{ prompt, args }] = spy.calls.txt2img;
        assert.match(prompt, /22 year old Indian girl Priya/);
        assert.match(prompt, /apni photo bhejo/);

        // txt2img(prompt, testMode): the cost settings live in the options
        // object, which is only passed on the object-form call.
        assert.equal(args.testMode, false, 'test mode must be off in production');

        const img = app.$('.chat-image');
        assert.ok(img, 'image element should be rendered');
        assert.ok(img.alt.length > 0, 'image needs alt text for a11y');
        assert.ok(app.text().includes('Priya shared a photo'));
    });

    it('replaces a broken image with a readable message instead of a broken icon', async () => {
        const app = boot((window) => ({
            ai: {
                chat: async () => ({ message: { content: 'x' } }),
                txt2img: async () => {
                    const img = window.document.createElement('img');
                    img.src = 'https://example.invalid/nope.png';
                    return img;
                }
            }
        }));
        await app.send('photo bhejo');

        const img = app.$('.chat-image');
        img.dispatchEvent(new app.window.Event('error'));
        await new Promise((r) => setTimeout(r, 10));

        assert.equal(app.$$('.chat-image').length, 0, 'broken image removed');
        assert.ok(app.text().includes('Photo nahi ban payi'));
    });

    it('pins a low quality tier so an upstream default change cannot raise cost', () => {
        const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
        const options = source.match(/const IMAGE_OPTIONS = \{([^}]*)\}/);

        assert.ok(options, 'IMAGE_OPTIONS should be a single-line object literal');
        assert.match(options[1], /quality:\s*'low'/, "quality must stay pinned to 'low'");
    });

    it('keeps test mode off, since it would show sample images to real users', () => {
        const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
        const flag = source.match(/const TEST_MODE = (true|false)/);

        assert.ok(flag, 'TEST_MODE constant should exist');
        assert.equal(flag[1], 'false');
    });

    it('shows a friendly message when txt2img returns nothing', async () => {
        const app = boot(() => ({
            ai: { chat: async () => ({ message: { content: 'x' } }), txt2img: async () => null }
        }));
        await app.send('photo bhejo');

        assert.ok(app.text().includes('kuch galat ho gaya'));
    });
});

describe('security', () => {
    it('renders model output as text, never as markup', async () => {
        const payload = '<img src=x onerror="window.__pwned=1">hi';
        const app = boot(() => ({
            ai: { chat: async () => ({ message: { content: payload } }), txt2img: async () => null }
        }));
        await app.send('test');

        assert.equal(app.$$('#chat-container img').length, 0, 'no injected element');
        assert.equal(app.window.__pwned, undefined, 'inline handler must not execute');
        assert.ok(app.text().includes('<img src=x'), 'shown literally');
    });

    it('renders user input as text too', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('<b>bold?</b>');

        assert.equal(app.$$('#chat-container b').length, 0);
    });
});

describe('error handling', () => {
    const cases = [
        [{ code: 'insufficient_funds', message: '402' }, 'credit khatam'],
        [{ code: 'too_many_requests', message: '429' }, 'dheere'],
        [{ name: 'AbortError', message: 'aborted' }, 'bahut der'],
        [{ message: 'boom' }, 'phir try karo']
    ];

    for (const [error, expected] of cases) {
        it(`maps "${error.code ?? error.name ?? error.message}" to a specific message`, async () => {
            const app = boot(() => ({
                ai: {
                    chat: async () => { throw Object.assign(new Error(error.message), error); },
                    txt2img: async () => null
                }
            }));
            await app.send('hi');

            assert.ok(app.text().includes(expected), `expected "${expected}" in output`);
        });
    }

    it('always clears the spinner and re-enables input after a failure', async () => {
        const app = boot(() => ({
            ai: { chat: async () => { throw new Error('boom'); }, txt2img: async () => null }
        }));
        await app.send('hi');

        assert.ok(!app.text().includes('Priya is typing'), 'spinner removed');
        assert.equal(app.document.getElementById('send-btn').disabled, false);
        assert.equal(app.document.getElementById('user-input').disabled, false);
    });

    it('tells the user when the SDK failed to load', async () => {
        const app = boot(() => undefined);
        await app.send('hi');

        assert.ok(app.text().includes('AI service load nahi hui'));
    });
});

describe('persona', () => {
    const readSource = () => readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const readHtml = () => readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    it('sends boundaries that forbid explicit roleplay', () => {
        const prompt = readSource();
        assert.match(prompt, /do not write sexual or explicit roleplay/i);
        assert.match(prompt, /never produce sexual content involving minors/i);
    });

    it('sends the medical-disclaimer boundary', () => {
        assert.match(readSource(), /never diagnose|do not pose as a medical professional/i);
    });

    it('stays in Hinglish', () => {
        assert.match(readSource(), /Hinglish/i);
    });

    // The greeting must not promise capability the model refuses to deliver.
    // This was the original bug: the copy advertised "sexy baatein" while every
    // provider silently blocked it, so the app looked broken.
    it('does not advertise explicit content in the visible copy', () => {
        const html = readHtml();
        const banned = /sexy baatein|fantasy ko bina|har fantasy/i;
        assert.ok(!banned.test(html), 'copy must not promise explicit roleplay');
    });

    it('states the roleplay limit up front in the greeting', () => {
        assert.match(readHtml(), /explicit roleplay nahi karti/i);
    });
});

describe('persistence', () => {
    it('restores the conversation after a reload', async () => {
        const first = boot(spyPuter({ reply: 'pehla jawab' }).factory);
        await first.send('pehla sawaal');

        const saved = first.window.sessionStorage.getItem('priya.chat.v1');
        assert.ok(saved, 'turn should have been persisted');

        // Simulate a reload: seed storage *before* app.js runs.
        const spy = spyPuter();
        const reloaded = boot((window) => {
            window.sessionStorage.setItem('priya.chat.v1', saved);
            return spy.factory(window);
        });

        assert.ok(reloaded.text().includes('pehla sawaal'), 'user turn restored');
        assert.ok(reloaded.text().includes('pehla jawab'), 'bot turn restored');

        // ...and the restored history is sent back to the model.
        await reloaded.send('teesra');
        const contents = spy.calls.chat[0].messages
            .filter((m) => m.role === 'user')
            .map((m) => m.content);
        // JSON round-trip drops the jsdom realm's prototype before comparing.
        assert.equal(JSON.stringify(contents), JSON.stringify(['pehla sawaal', 'teesra']));
    });

    it('survives corrupt stored data', async () => {
        const app = boot(spyPuter().factory);
        app.window.sessionStorage.setItem('priya.chat.v1', '{not json');
        const again = boot(spyPuter().factory);
        await again.send('hi');

        assert.ok(again.text().includes('Haan jaan'));
    });

    it('clears the transcript and storage', async () => {
        const app = boot(spyPuter().factory);
        await app.send('pehla');
        assert.ok(app.text().includes('pehla'));

        app.document.getElementById('clear-btn').click();
        await new Promise((r) => setTimeout(r, 10));

        assert.ok(!app.text().includes('pehla'), 'message removed');
        assert.equal(app.window.sessionStorage.getItem('priya.chat.v1'), null);
        assert.ok(app.text().includes('Main Priya hu'), 'greeting restored');
    });
});
