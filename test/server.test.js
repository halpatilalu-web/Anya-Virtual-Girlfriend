import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const PORT = 8231;
const BASE = `http://127.0.0.1:${PORT}`;
const SERVE = fileURLToPath(new URL('../scripts/serve.js', import.meta.url));

describe('dev server', () => {
    let child;

    before(async () => {
        child = spawn(process.execPath, [SERVE], {
            env: { ...process.env, PORT: String(PORT) },
            stdio: 'ignore'
        });

        // Poll until it accepts connections.
        for (let i = 0; i < 50; i += 1) {
            try {
                await fetch(`${BASE}/index.html`);
                return;
            } catch {
                await new Promise((r) => setTimeout(r, 100));
            }
        }
        throw new Error('dev server did not start');
    });

    after(() => child?.kill());

    const status = async (path) => (await fetch(`${BASE}${path}`)).status;

    for (const path of ['/', '/index.html', '/app.js', '/README.md']) {
        it(`serves ${path}`, async () => {
            assert.equal(await status(path), 200);
        });
    }

    // These either escape the docroot or expose files the browser never needs.
    const blocked = [
        '/.git/config',
        '/..%2f..%2fetc/passwd',
        '/package.json',
        '/package-lock.json',
        '/scripts/serve.js',
        '/test/app.test.js',
        '/node_modules/jsdom/package.json'
    ];

    for (const path of blocked) {
        it(`refuses ${path}`, async () => {
            assert.notEqual(await status(path), 200);
        });
    }

    it('serves the app with the Puter SDK wired up', async () => {
        const html = await (await fetch(`${BASE}/index.html`)).text();
        assert.match(html, /js\.puter\.com\/v2\//);
        assert.ok(!/pollinations/i.test(html), 'Pollinations must stay gone');
    });

    it('sends correct content types', async () => {
        const res = await fetch(`${BASE}/app.js`);
        assert.match(res.headers.get('content-type'), /javascript/);
    });
});
