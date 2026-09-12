// Every script the acceptance run injects into the window has to parse.
//
// This exists because one of them did not, and the way that failed is the
// reason it is worth a test of its own rather than a careful eye.
//
// `executeJavaScript` takes a string, and in this file those strings are
// written as template literals — so `\n` and `\s` inside one are read by
// TypeScript, not by the browser. `rows.join('\n')` compiles to a single-quoted
// string with a real newline inside it, which is a SyntaxError in the window;
// `replace(/\s+/g, ' ')` compiles to `/s+/g`, which quietly deletes the letter
// s from whatever the screen said. The first of those broke every smoke run:
// the injected script threw, the promise rejected with nothing awaiting it, the
// flow stopped where it stood, and the window was held open until the CI step's
// own ten-minute limit killed it. Ten minutes, and a log that said nothing.
//
// So the built driver is read back and each injected script is handed to the
// parser. `${...}` substitutions are replaced with a literal, because what is
// being checked is the shape of the script and not the value of a selector.
// A script that does not parse fails here, in two seconds, with its line.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, '..', 'dist', 'ayq-main.js');

/** One injected script, as the window would receive it. */
type Injected = { line: number; body: string };

function injectedScripts(source: string): Injected[] {
  const found: Injected[] = [];
  const call = /executeJavaScript\(\s*(`|'|")/g;

  let match: RegExpExecArray | null;
  while ((match = call.exec(source)) !== null) {
    const quote = match[1];
    const opens = match.index + match[0].length - 1;

    // The end of the literal, respecting escapes. Template literals in this
    // file do not nest backticks, and a `${...}` never contains one either.
    let at = opens + 1;
    while (at < source.length) {
      if (source[at] === '\\') {
        at += 2;
        continue;
      }
      if (source[at] === quote) break;
      at += 1;
    }
    assert.ok(at < source.length, 'an injected script is never closed');

    const raw = source.slice(opens + 1, at);
    const body =
      quote === '`'
        ? // What the window is given: a substitution is some value, and the
          // shape of the script must not depend on which. A bare identifier,
          // because a substitution stands in a property position as often as
          // in an expression one and has to parse in both.
          raw.replaceAll(/\$\{[^{}]*\}/g, 'substituted')
        : // A plain string literal: the escapes are the escapes.
          (JSON.parse(`"${raw.replaceAll('"', '\\"').replaceAll("\\'", "'")}"`) as string);

    found.push({ line: source.slice(0, opens).split('\n').length, body });
    call.lastIndex = at + 1;
  }
  return found;
}

test('every script the acceptance run injects parses in a browser', () => {
  const source = readFileSync(built, 'utf8');
  const scripts = injectedScripts(source);

  // If this ever reads zero, the check has stopped checking anything.
  assert.ok(
    scripts.length > 20,
    `found only ${scripts.length} injected scripts, which cannot be right`,
  );

  const broken: string[] = [];
  for (const script of scripts) {
    try {
      // Parsed, not run. `new Function` compiles the body and throws on a
      // syntax error, which is the whole of what is being asked.
      new Function(script.body);
    } catch (error) {
      broken.push(
        `dist/ayq-main.js:${script.line} — ${
          error instanceof Error ? error.message : String(error)
        }\n${script.body}`,
      );
    }
  }

  assert.deepEqual(broken, [], broken.join('\n\n'));
});

test('the check itself fails on the mistake it exists for', () => {
  // A template literal holding `join('\n')` — written here the way the driver
  // wrote it, so that this asserts the defect and not a description of it.
  const asWritten = "executeJavaScript(`(() => rows.join('\n'))()`)";
  const [script] = injectedScripts(asWritten);
  assert.ok(script, 'the extractor did not find the script at all');
  assert.throws(() => new Function(script.body), SyntaxError);

  // And passes on the same script written correctly.
  const correct = 'executeJavaScript(`(() => rows.join(\'\\n\'))()`)';
  const [fixed] = injectedScripts(correct);
  assert.ok(fixed);
  new Function(fixed.body);
});

test('a regular expression survives the journey into the window', () => {
  const source = readFileSync(built, 'utf8');
  for (const script of injectedScripts(source)) {
    // `/s+/` is what `/\s+/` becomes when the backslash was eaten by the
    // template literal. It is not a syntax error, so the parse check above
    // cannot see it: it just silently deletes every s from the text.
    assert.ok(
      !/\/s\+\//.test(script.body),
      `dist/ayq-main.js:${script.line} collapses whitespace with /s+/, ` +
        'which deletes the letter s instead',
    );
  }
});
