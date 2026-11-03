#!/usr/bin/env node
/**
 * Guards against the class of bug this repo shipped with: Tailwind-ish
 * property names (`max-w`, `border-b`, `tracking-letter`) pasted into a plain
 * <style> block, where they are silently ignored by every browser.
 *
 * Fails with a non-zero exit code if any CSS declaration is invalid.
 */

import { readFile } from 'node:fs/promises';
import * as csstree from 'css-tree';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);

if (styleBlocks.length === 0) {
    console.error('lint-css: no <style> block found in index.html');
    process.exit(1);
}

let problems = 0;

for (const [index, css] of styleBlocks.entries()) {
    const ast = csstree.parse(css, { positions: true });

    csstree.walk(ast, {
        visit: 'Declaration',
        enter(node) {
            const label = `<style> block ${index + 1}, line ${node.loc.start.line}`;
            let error = null;

            try {
                const match = csstree.lexer.matchProperty(node.property, node.value);
                if (match.error) error = match.error.message.split('\n')[0];
            } catch {
                error = `Unknown property \`${node.property}\``;
            }

            if (error) {
                problems += 1;
                const value = csstree.generate(node.value);
                console.error(`  ${label}: ${node.property}: ${value}`);
                console.error(`    -> ${error}`);
            }
        }
    });
}

if (problems > 0) {
    console.error(`\nlint-css: ${problems} invalid CSS declaration(s).`);
    process.exit(1);
}

console.log('lint-css: all CSS declarations are valid.');
