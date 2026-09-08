// Access to the parsed xml2js tree without losing information.
//
// The same parser and the same options as Actual (xml2js, explicitArray:
// false), so the result can drop into a fork of the monorepo without a new
// dependency. Three differences, each deliberate:
//   1. namespace prefixes are stripped, so the traversal does not depend on
//      whether the bank writes <Ntry> or <ns2:Ntry>;
//   2. text nodes are NOT trimmed — the raw description must stay untouched,
//      including the internal runs of spaces that identify the card format;
//   3. the padding out to 32,500 bytes is cut before parsing.

import { parseStringPromise } from 'xml2js';

/** A node in the xml2js tree: a string, an object with attributes, or a list. */
export type AyqXmlNode = unknown;

/**
 * Cuts the padding around the XML.
 *
 * Each of the 212 ABN AMRO files is padded with spaces to exactly 32,500
 * bytes. That is a fixed record length, not corruption — but it means two
 * copies of the same day do not compare byte for byte until the padding is
 * gone. A byte-order mark is removed too.
 */
export function ayqStripPadding(content: string): string {
  return content.replace(/^﻿/, '').trim();
}

const NAMESPACE_PREFIX = /^.*:/;

export async function ayqParseXml(content: string): Promise<unknown> {
  return parseStringPromise(ayqStripPadding(content), {
    explicitArray: false,
    trim: false,
    tagNameProcessors: [(name: string) => name.replace(NAMESPACE_PREFIX, '')],
  });
}

function isRecord(node: AyqXmlNode): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/** One child by name. When there are several, the first is returned. */
export function ayqChild(node: AyqXmlNode, name: string): AyqXmlNode {
  if (!isRecord(node)) return undefined;
  const value = node[name];
  return Array.isArray(value) ? value[0] : value;
}

/** All children by name, always as a list. */
export function ayqChildren(node: AyqXmlNode, name: string): AyqXmlNode[] {
  if (!isRecord(node)) return [];
  const value = node[name];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Walks a path of names, taking the first child at each step. */
export function ayqPath(node: AyqXmlNode, ...names: string[]): AyqXmlNode {
  let current = node;
  for (const name of names) {
    current = ayqChild(current, name);
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * A node's text, untouched.
 *
 * xml2js gives a string for an element without attributes and
 * { _: text, $: attributes } for one with them. An empty element yields an
 * empty string, which is treated as absent so that missing fields do not turn
 * into empty strings.
 */
export function ayqText(node: AyqXmlNode): string | null {
  if (typeof node === 'string') return node.length > 0 ? node : null;
  if (isRecord(node) && typeof node._ === 'string') {
    return node._.length > 0 ? node._ : null;
  }
  return null;
}

/** Text at a path. */
export function ayqTextAt(node: AyqXmlNode, ...names: string[]): string | null {
  return ayqText(ayqPath(node, ...names));
}

/** An attribute of a node. */
export function ayqAttr(node: AyqXmlNode, name: string): string | null {
  if (!isRecord(node)) return null;
  const attrs = node.$;
  if (!isRecord(attrs)) return null;
  const value = attrs[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Every text of a repeating element, line by line, untouched. */
export function ayqTextList(node: AyqXmlNode, name: string): string[] {
  const out: string[] = [];
  for (const child of ayqChildren(node, name)) {
    const text = ayqText(child);
    if (text !== null) out.push(text);
  }
  return out;
}

/**
 * Recursive search for an element by name across the whole subtree.
 *
 * Kept only for roots whose position depends on the message kind (camt.053 vs
 * .052 vs .054). The entry itself is walked by explicit path — blind search is
 * exactly why the original parser picks up an <Nm> from the postal address
 * when the party has no name of its own.
 */
export function ayqFindAll(node: AyqXmlNode, name: string): AyqXmlNode[] {
  const out: AyqXmlNode[] = [];
  const visit = (current: AyqXmlNode) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isRecord(current)) return;
    for (const key of Object.keys(current)) {
      if (key === '$') continue;
      if (key === name) {
        for (const match of ayqChildren(current, key)) out.push(match);
      } else {
        visit(current[key]);
      }
    }
  };
  visit(node);
  return out;
}
