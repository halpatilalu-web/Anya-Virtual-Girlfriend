#!/usr/bin/env node
/**
 * Zero-dependency static dev server.
 *
 * Puter.js needs a real http:// origin, so `file://index.html` will not work.
 * Run `npm start` instead.
 *
 * Binds 0.0.0.0 so the app also works through a proxied preview host.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath on a directory URL keeps the trailing separator; strip it so
// the `ROOT + sep` prefix check below doesn't end up with a double separator.
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[/\\]$/, '');
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.md': 'text/markdown; charset=utf-8'
};

// Allowlist: the browser only ever needs these. Anything else (package.json,
// package-lock.json, tooling configs) stays private.
const PUBLIC_FILES = new Set(['index.html', 'app.js', 'README.md']);

/** Resolve a URL path to a file inside ROOT, or null if it escapes/skips it. */
function resolvePath(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const relative = normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const target = join(ROOT, relative);

    // Directory traversal guard: the resolved path must stay inside ROOT.
    if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
    // Never serve dotfiles (.git, .env, .gitignore ...).
    if (relative.split(/[/\\]/).some((part) => part.startsWith('.') && part !== '')) return null;
    // Only ever serve a small set of public static assets.
    if (!PUBLIC_FILES.has(relative.replace(/\\/g, '/'))) return null;

    return target;
}

const server = createServer(async (req, res) => {
    const requestPath = req.url === '/' ? '/index.html' : req.url;
    const filePath = resolvePath(requestPath);

    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    try {
        const info = await stat(filePath);
        if (!info.isFile()) throw new Error('not a file');

        const body = await readFile(filePath);
        res.writeHead(200, {
            'Content-Type': MIME[extname(filePath).toLowerCase()],
            'Content-Length': body.length,
            'Cache-Control': 'no-store'
        });
        res.end(body);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Priya is live at http://localhost:${PORT}`);
    console.log('Do not open index.html as a file:// URL — Puter.js needs http://.');
});
