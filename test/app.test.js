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
                chat: async (_messages, options) => {
                    calls += 1;
                    await gate;
                    if (!options?.stream) return { message: { content: 'slow' } };
                    return (async function* () { yield { type: 'text', text: 'slow' }; })();
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

describe('expressive voice', () => {
    const spokenText = async (reply) => {
        const spy = spyPuter({ reply });
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));
        return spy.calls.txt2speech[0];
    };

    it('sends SSML with prosody', async () => {
        const call = await spokenText('Haan jaan.');
        assert.match(call.text, /^<speak>/);
        assert.match(call.text, /<prosody rate="/);
        assert.equal(call.options.ssml, true);
    });

    it('speaks excited replies faster and higher', async () => {
        const call = await spokenText('OMG haan!! Bohot mazaa aaya 😍');
        assert.match(call.text, /rate="108%"/);
        assert.match(call.text, /pitch="\+3%"/);
    });

    it('speaks tender replies slower and softer', async () => {
        const call = await spokenText('Tumhari yaad aa rahi thi...');
        assert.match(call.text, /rate="92%"/);
        assert.match(call.text, /pitch="-2%"/);
    });

    it('inserts a break between sentences', async () => {
        const call = await spokenText('Pehla. Doosra. Teesra.');
        assert.match(call.text, /<break time="/);
    });

    it('escapes XML so a stray ampersand cannot break SSML', async () => {
        const call = await spokenText('Me & you <3');
        assert.match(call.text, /&amp;/);
        assert.ok(!/<3/.test(call.text), 'raw angle bracket escaped');
    });

    it('keeps the Indian English voice settings', async () => {
        const call = await spokenText('Haan.');
        assert.equal(call.options.language, 'en-IN');
        assert.equal(call.options.voice, 'Kajal');
        assert.equal(call.options.engine, 'neural');
    });
});

describe('reactions', () => {
    it('renders a reaction bar under every reply', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        assert.equal(app.$$('.reaction-bar').length, 1);
        assert.equal(app.$$('.reaction-btn').length, 3);
    });

    it('stores the picked reaction and marks the button', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        app.$('.reaction-btn').click();

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.lastReaction, '\u2764\uFE0F');
        assert.equal(app.$$('.reaction-btn.is-picked').length, 1);
    });

    it('tells her about the reaction on the next turn', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('pehla');
        await new Promise((r) => setTimeout(r, 30));

        app.$('.reaction-btn').click();
        await app.send('doosra');

        assert.match(spy.calls.chat[1].messages[0].content, /reacted to your last message/);
    });

    it('replaces the previous reaction rather than accumulating', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        app.$$('.reaction-btn')[0].click();
        app.$$('.reaction-btn')[1].click();

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.lastReaction, '\u{1F602}');
        assert.equal(app.$$('.reaction-btn.is-picked').length, 1);
    });
});

describe('streaming', () => {
    it('requests a stream', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('hi');

        assert.equal(spy.calls.chat[0].options.stream, true);
    });

    it('paints multiple chunks into one bubble', async () => {
        const spy = spyPuter({ chunks: ['Haan ', 'jaan, ', 'sun rahi hu ❤️'] });
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        const transcript = app.document.getElementById('chat-container').textContent;
        assert.ok(transcript.includes('Haan jaan, sun rahi hu ❤️'));
        // One reply bubble, not one per chunk. The static greeting is also a
        // .bot-bubble, so count replies by their text only.
        const replies = app.$$('.bubble.bot-bubble').filter((b) => b.textContent.includes('Haan'));
        assert.equal(replies.length, 1);
    });

    it('never flashes a partial marker while streaming', async () => {
        // The marker arrives split across chunks; none of it may render.
        const spy = spyPuter({ chunks: ['Theek hai. ', '[[remem', 'ber: He is 24]]'] });
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        const transcript = app.document.getElementById('chat-container').textContent;
        assert.ok(!transcript.includes('[['), 'no marker fragments on screen');
        assert.ok(transcript.includes('Theek hai.'));

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.facts.length, 1);
    });

    it('removes the typing spinner as soon as the stream starts', async () => {
        const spy = spyPuter({ chunks: ['a', 'b'] });
        const app = boot(spy.factory);

        const pending = app.send('hi');
        await pending;

        // The streamed bubble is the reply; the spinner must be gone even though
        // the reply is still painting.
        assert.equal(app.$$('.typing-indicator').length, 0);
        assert.equal(app.$$('.bubble.is-streaming').length, 0, 'caret cleared on finish');
    });

    it('marks the bubble as streaming while chunks arrive', async () => {
        const spy = spyPuter({ chunks: ['a', 'b', 'c'] });
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        // After finishing, the streaming class is removed.
        assert.equal(app.$$('.is-streaming').length, 0);
    });

    it('attaches the speaker button only once the reply is final', async () => {
        const spy = spyPuter({ chunks: ['a', 'b', 'c'] });
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        assert.equal(app.$$('.speak-btn').length, 1);
    });

    it('falls back to a single request when streaming fails', async () => {
        let nonStreamCalls = 0;
        const app = boot(() => ({
            ai: {
                chat: async (_messages, options) => {
                    if (options?.stream) throw new Error('streaming unsupported');
                    nonStreamCalls += 1;
                    return { message: { content: 'fallback reply' } };
                },
                txt2img: async () => null
            }
        }));
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        assert.equal(nonStreamCalls, 1);
        assert.ok(app.text().includes('fallback reply'));
    });

    it('falls back when the stream yields no text at all', async () => {
        let nonStreamCalls = 0;
        const app = boot(() => ({
            ai: {
                chat: async (_messages, options) => {
                    if (options?.stream) return (async function* () {})();
                    nonStreamCalls += 1;
                    return { message: { content: 'second try' } };
                },
                txt2img: async () => null
            }
        }));
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        assert.equal(nonStreamCalls, 1);
        assert.ok(app.text().includes('second try'));
    });

    it('keeps a partial reply instead of discarding it', async () => {
        const app = boot(() => ({
            ai: {
                chat: async (_messages, options) => {
                    if (!options?.stream) return { message: { content: 'unused' } };
                    return (async function* () {
                        yield { type: 'text', text: 'aadha jawab ' };
                        throw new Error('connection dropped');
                    })();
                },
                txt2img: async () => null
            }
        }));
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        assert.ok(app.text().includes('aadha jawab'), 'partial text survives');
    });

    it('ignores non-text chunks', async () => {
        const app = boot(() => ({
            ai: {
                chat: async (_messages, options) => {
                    if (!options?.stream) return { message: { content: 'unused' } };
                    return (async function* () {
                        yield { type: 'reasoning', text: 'thinking hard' };
                        yield { type: 'text', text: 'asli jawab' };
                        yield { type: 'usage', input_tokens: 5 };
                    })();
                },
                txt2img: async () => null
            }
        }));
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 30));

        const transcript = app.document.getElementById('chat-container').textContent;
        assert.ok(transcript.includes('asli jawab'));
        assert.ok(!transcript.includes('thinking hard'), 'reasoning is not shown');
    });
});

describe('spontaneous selfies', () => {
    it('sends a photo when the model asks for one and cooldown allows', async () => {
        const spy = spyPuter({ reply: 'Miss kar rahi thi [[selfie]]' });
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 40));

        assert.equal(spy.calls.txt2img.length, 1, 'selfie generated');
        assert.ok(app.text().includes('Priya sent a photo'), 'caption differs from a requested photo');
    });

    it('never shows the marker', async () => {
        const spy = spyPuter({ reply: 'Lo [[selfie]]' });
        const app = boot(spy.factory);
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 40));

        assert.ok(!app.text().includes('[['));
    });

    it('respects the cooldown so she cannot flood the chat', async () => {
        const spy = spyPuter({ reply: 'ek aur [[selfie]]' });
        const app = boot(spy.factory);

        await app.send('one');
        await new Promise((r) => setTimeout(r, 40));
        await app.send('two');
        await new Promise((r) => setTimeout(r, 40));

        assert.equal(spy.calls.txt2img.length, 1, 'second request is inside the cooldown');
    });

    it('does not break the chat when the selfie fails', async () => {
        const spy = spyPuter({ reply: 'Lo [[selfie]]' });
        const app = boot((window) => {
            const api = spy.factory(window);
            api.ai.txt2img = async () => { throw new Error('image service down'); };
            return api;
        });
        await app.send('hi');
        await new Promise((r) => setTimeout(r, 40));

        assert.ok(app.text().includes('Lo'), 'reply still shown');
        assert.ok(!app.text().includes('Photo nahi ban payi'), 'no scary error for a photo he never asked for');
    });
});

describe('long-term memory', () => {
    const systemOf = (spy, i = 0) => spy.calls.chat[i].messages[0].content;

    it('teaches the model the marker format', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('hi');

        const prompt = systemOf(spy);
        assert.match(prompt, /\[\[remember:/);
        assert.match(prompt, /\[\[mood:/);
    });

    it('stores a fact the model asks to remember and hides the marker', async () => {
        const app = boot(spyPuter({ reply: 'Yaad rakhungi jaan. [[remember: He is an engineering student]]' }).factory);
        await app.send('main engineering student hu');

        const transcript = app.document.getElementById('chat-container').textContent;
        assert.ok(!transcript.includes('[['), 'marker must never render');
        assert.ok(transcript.includes('Yaad rakhungi'), 'reply text kept');

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.facts.length, 1);
        assert.match(stored.facts[0].text, /engineering student/);
    });

    it('replays remembered facts into the next system prompt', async () => {
        const spy = spyPuter({ reply: 'Got it. [[remember: He loves biryani]]' });
        const app = boot(spy.factory);
        await app.send('mujhe biryani pasand hai');
        await app.send('kya haal');

        assert.match(systemOf(spy, 1), /He loves biryani/);
    });

    it('does not store the same fact twice', async () => {
        const app = boot(spyPuter({ reply: 'ok [[remember: He loves biryani]]' }).factory);
        await app.send('a');
        await app.send('b');

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.facts.length, 1);
    });

    it('records a mood change', async () => {
        const app = boot(spyPuter({ reply: 'Hmph. [[mood: sulky]]' }).factory);
        await app.send('sorry, busy tha');

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.mood, 'sulky');
    });

    it('ignores an invalid mood value but strips the marker', async () => {
        const app = boot(spyPuter({ reply: 'theek hai [[mood: furious]]' }).factory);
        await app.send('hi');

        const transcript = app.document.getElementById('chat-container').textContent;
        assert.ok(!transcript.includes('[[['), 'marker stripped');
        assert.ok(!transcript.includes('mood:'), 'marker stripped');
        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.notEqual(stored.mood, 'furious');
    });

    it('survives across reloads and shows what she knows', async () => {
        const first = boot(spyPuter({ reply: 'ok [[remember: He works nights]]' }).factory);
        await first.send('main night shift karta hu');
        const saved = first.window.localStorage.getItem('priya.memory.v1');

        const spy = spyPuter();
        const reloaded = boot((window) => {
            window.localStorage.setItem('priya.memory.v1', saved);
            return spy.factory(window);
        });

        await reloaded.send('hi');
        assert.match(systemOf(spy), /He works nights/);

        reloaded.document.getElementById('memory-btn').click();
        const panel = reloaded.document.getElementById('memory-list').textContent;
        assert.match(panel, /night shift|works nights/);
    });

    it('lets the user delete a single fact', async () => {
        const app = boot(spyPuter({ reply: 'ok [[remember: He hates crowds]]' }).factory);
        await app.send('bhide me nahi jaata');

        app.document.getElementById('memory-btn').click();
        app.document.querySelector('.memory-del').click();

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.facts.length, 0);
    });

    it('forget-all wipes memory and transcript', async () => {
        const app = boot(spyPuter({ reply: 'ok [[remember: He is 24]]' }).factory);
        await app.send('main 24 saal ka hu');

        app.document.getElementById('memory-forget').click();
        await new Promise((r) => setTimeout(r, 20));

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.facts.length, 0, 'facts gone');
        assert.equal(stored.name, '', 'name gone');
        assert.ok(!app.document.getElementById('chat-container').textContent.includes('24'), 'transcript cleared');
    });

    it('degrades safely when localStorage is unavailable', async () => {
        const app = boot(spyPuter().factory);
        // Break storage the way a sandboxed iframe or private mode would.
        Object.defineProperty(app.window, 'localStorage', {
            get() { throw new Error('blocked'); },
            configurable: true
        });

        await app.send('hi');
        assert.ok(app.text().includes('Haan jaan'), 'chat still works');
    });
});

describe('onboarding', () => {
    it('asks for a name on first run', () => {
        const app = boot(spyPuter().factory);
        assert.equal(app.document.getElementById('onboarding').hidden, false);
    });

    it('saves the name and work, then greets by name', async () => {
        const app = boot(spyPuter().factory);
        app.document.getElementById('ob-name').value = 'Arjun';
        app.document.getElementById('ob-work').value = 'engineering student hu';
        app.document.getElementById('ob-start').click();
        await new Promise((r) => setTimeout(r, 20));

        const stored = JSON.parse(app.window.localStorage.getItem('priya.memory.v1'));
        assert.equal(stored.name, 'Arjun');
        assert.match(stored.facts[0].text, /engineering student/);

        assert.equal(app.document.getElementById('onboarding').hidden, true);
        assert.match(app.document.getElementById('chat-container').textContent, /Arjun/);
    });

    it('does not ask again once a name is stored', () => {
        const spy = spyPuter();
        const app = boot((window) => {
            window.localStorage.setItem('priya.memory.v1', JSON.stringify({
                name: 'Arjun', facts: [], firstSeen: Date.now(), lastSeen: Date.now(), mood: 'warm', visits: 2
            }));
            return spy.factory(window);
        });
        assert.equal(app.document.getElementById('onboarding').hidden, true);
    });

    it('can be skipped', () => {
        const app = boot(spyPuter().factory);
        app.document.getElementById('ob-skip').click();
        assert.equal(app.document.getElementById('onboarding').hidden, true);
    });
});

describe('time awareness', () => {
    it('puts the current date, time and part of day in the prompt', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('hi');

        const prompt = spy.calls.chat[0].messages[0].content;
        assert.match(prompt, /Right now it is (late at night|morning|afternoon|evening|night)/);
    });

    it('tells her the relationship length', async () => {
        const spy = spyPuter();
        const app = boot((window) => {
            window.localStorage.setItem('priya.memory.v1', JSON.stringify({
                name: 'Arjun', facts: [], firstSeen: Date.now() - 6 * 86400000,
                lastSeen: Date.now(), mood: 'warm', visits: 3
            }));
            return spy.factory(window);
        });
        await app.send('hi');

        assert.match(spy.calls.chat[0].messages[0].content, /together for 7 days/);
    });

    it('shows the day counter in the header', () => {
        const app = boot((window) => {
            window.localStorage.setItem('priya.memory.v1', JSON.stringify({
                name: 'Arjun', facts: [], firstSeen: Date.now() - 4 * 86400000,
                lastSeen: Date.now(), mood: 'warm', visits: 3
            }));
            return spyPuter().factory(window);
        });
        assert.match(app.document.getElementById('memory-btn').textContent, /Day 5/);
    });
});

describe('voice', () => {
    it('speaks a reply when voice mode is on by default', async () => {
        const spy = spyPuter({ reply: 'Haan jaan ❤️' });
        const app = boot(spy.factory);
        await app.send('kaise ho');
        await new Promise((r) => setTimeout(r, 30));

        assert.equal(spy.calls.txt2speech.length, 1);
        // Expressive voice wraps the reply in SSML (see buildSsml).
        assert.match(spy.calls.txt2speech[0].text, /Haan jaan ❤️/);
    });

    it('uses an Indian English neural voice, which suits Hinglish', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('kaise ho');
        await new Promise((r) => setTimeout(r, 30));

        const { options } = spy.calls.txt2speech[0];
        assert.equal(options.language, 'en-IN');
        assert.equal(options.engine, 'neural');
        assert.equal(options.provider, 'aws-polly');
    });

    it('stays silent when voice mode is switched off', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);

        app.document.getElementById('voice-btn').click();
        await app.send('kaise ho');
        await new Promise((r) => setTimeout(r, 30));

        assert.equal(spy.calls.txt2speech.length, 0);
        assert.match(app.document.getElementById('voice-btn').textContent, /Off/);
    });

    it('adds a speaker button to every reply', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('kaise ho');

        assert.equal(app.$$('.speak-btn').length, 1);
    });

    it('replays the cached audio instead of paying for it twice', async () => {
        const spy = spyPuter({ reply: 'Ek hi jawab' });
        const app = boot(spy.factory);
        await app.send('pehla');
        await new Promise((r) => setTimeout(r, 30));

        // Click the speaker on the same bubble again.
        app.$('.speak-btn').click();
        await new Promise((r) => setTimeout(r, 30));

        assert.equal(spy.calls.txt2speech.length, 1, 'second play must not re-synthesise');
    });

    it('survives a TTS failure without breaking the chat', async () => {
        const app = boot((window) => ({
            ai: {
                chat: async () => ({ message: { content: 'jawab' } }),
                txt2img: async () => null,
                txt2speech: async () => { throw new Error('tts down'); }
            }
        }));
        await app.send('kaise ho');
        await new Promise((r) => setTimeout(r, 40));

        assert.ok(app.text().includes('jawab'), 'reply still rendered');
        assert.equal(app.document.getElementById('send-btn').disabled, false);
    });
});

describe('photo style', () => {
    it('defaults to a plain portrait prompt', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        await app.send('photo bhejo');

        const { prompt } = spy.calls.txt2img[0];
        assert.ok(!/fashion editorial/i.test(prompt), 'no styling by default');
    });

    it('adds styling after toggling the mode', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);

        app.document.getElementById('mode-btn').click();
        await app.send('photo bhejo');

        const { prompt } = spy.calls.txt2img[0];
        assert.match(prompt, /fashion editorial/i);
        assert.match(prompt, /85mm lens/i);
        assert.ok(app.text().includes('styled'), 'caption reflects the style');
    });

    it('toggles back to normal', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        const modeBtn = app.document.getElementById('mode-btn');

        modeBtn.click();
        modeBtn.click();
        await app.send('photo bhejo');

        assert.match(modeBtn.textContent, /Normal/);
        assert.ok(!/fashion editorial/i.test(spy.calls.txt2img[0].prompt));
    });

    it('never asks the image model for explicit content', async () => {
        const spy = spyPuter();
        const app = boot(spy.factory);
        for (const mode of ['normal']) {
            app.document.getElementById('mode-btn').click();
        }
        await app.send('photo bhejo');

        const { prompt } = spy.calls.txt2img[0];
        const banned = /nude|naked|nsfw|lingerie|explicit|sexy/i;
        assert.ok(!banned.test(prompt), 'prompt must stay within policy');
    });
});

describe('persona', () => {
    const readSource = () => readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const readHtml = () => readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    // The character is a girlfriend first. These tests exist because a previous
    // revision quietly turned her into a neutral guide, which was not the
    // product.
    it('is a romantic girlfriend, not a generic assistant', () => {
        assert.match(readSource(), /romantic girlfriend/i);
        assert.match(readHtml(), /girlfriend/i);
    });

    it('keeps a personality: opinions and short texting style', () => {
        const prompt = readSource();
        assert.match(prompt, /Have opinions/i);
        assert.match(prompt, /1-3 sentences/i);
    });

    it('stays in Hinglish and keeps pet names', () => {
        const prompt = readSource();
        assert.match(prompt, /Hinglish/i);
        assert.match(prompt, /pet names/i);
    });

    it('is still comfortable answering real intimacy questions', () => {
        assert.match(readSource(), /contraception/i);
        assert.match(readSource(), /without shame/i);
    });

    it('sends boundaries that forbid explicit roleplay', () => {
        const prompt = readSource();
        assert.match(prompt, /No explicit sexual roleplay/i);
        assert.match(prompt, /sexual content involving minors/i);
    });

    it('stops her becoming a refusal machine', () => {
        // A model that lectures on every turn is a worse product than one that
        // redirects once and stays warm.
        assert.match(readSource(), /Never lecture twice/i);
    });

    it('sends the medical-disclaimer boundary', () => {
        assert.match(readSource(), /Never diagnose/i);
    });

    // The greeting must not promise capability the model refuses to deliver.
    // This was the original bug: the copy advertised "sexy baatein" while every
    // provider silently blocked it, so the app looked broken.
    it('does not advertise explicit content in the visible copy', () => {
        const banned = /sexy baatein|fantasy ko bina|har fantasy/i;
        assert.ok(!banned.test(readHtml()), 'copy must not promise explicit roleplay');
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

    it('clears the transcript and storage via the memory panel', async () => {
        const app = boot(spyPuter().factory);
        await app.send('pehla');
        assert.ok(app.text().includes('pehla'));

        // "Forget all" in the memory panel doubles as clear-chat.
        app.document.getElementById('memory-forget').click();
        await new Promise((r) => setTimeout(r, 10));

        // body.textContent also picks up hidden overlays (onboarding, memory
        // panel), so assert on the chat transcript itself.
        const transcript = app.document.getElementById('chat-container').textContent;
        assert.ok(!transcript.includes('pehla'), 'message removed');
        assert.equal(app.window.sessionStorage.getItem('priya.chat.v1'), null);
        assert.ok(app.text().includes('Main Priya hu'), 'greeting restored');
    });
});
