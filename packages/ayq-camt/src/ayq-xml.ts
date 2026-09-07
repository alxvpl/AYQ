// Достъп до разпарснатото xml2js дърво без загуба на информация.
//
// Ползва се същият парсър и същите опции като в Actual (xml2js,
// explicitArray: false), за да може резултатът да влезе във форк на monorepo-то
// без нова зависимост. Разликите са три и всяка е нарочна:
//   1. префиксите на пространствата от имена се свалят, за да не зависи обходът
//      от това дали банката пише <Ntry> или <ns2:Ntry>;
//   2. текстовите възли НЕ се trim-ват — суровото описание трябва да остане
//      непокътнато, включително вътрешните поредици от интервали, по които
//      се разпознава BEA форматът;
//   3. запълването с интервали до 32 500 байта се реже преди парсването.

import { parseStringPromise } from 'xml2js';

/** Възел от xml2js дървото: низ, обект с атрибути, или списък от такива. */
export type AyqXmlNode = unknown;

/**
 * Реже запълването около XML-а.
 *
 * Всеки от 212-те ABN AMRO файла е допълнен с интервали до точно 32 500 байта.
 * Това е фиксирана дължина на записа, не повреда — но означава, че две копия
 * на един и същ ден не се сравняват байт по байт, преди запълването да падне.
 * Маха се и BOM-ът, ако го има.
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

/** Едно дете по име. Ако децата са няколко, връща първото. */
export function ayqChild(node: AyqXmlNode, name: string): AyqXmlNode {
  if (!isRecord(node)) return undefined;
  const value = node[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Всички деца по име, винаги като списък. */
export function ayqChildren(node: AyqXmlNode, name: string): AyqXmlNode[] {
  if (!isRecord(node)) return [];
  const value = node[name];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Слиза по път от имена, взимайки първото дете на всяка стъпка. */
export function ayqPath(node: AyqXmlNode, ...names: string[]): AyqXmlNode {
  let current = node;
  for (const name of names) {
    current = ayqChild(current, name);
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * Текстът на възел, непокътнат.
 *
 * xml2js дава низ за елемент без атрибути и { _: текст, $: атрибути } за
 * елемент с атрибути. Празен елемент дава празен низ — той се третира като
 * липсващ, за да не се получават празни низове там, където полето го няма.
 */
export function ayqText(node: AyqXmlNode): string | null {
  if (typeof node === 'string') return node.length > 0 ? node : null;
  if (isRecord(node) && typeof node._ === 'string') {
    return node._.length > 0 ? node._ : null;
  }
  return null;
}

/** Текст по път. */
export function ayqTextAt(node: AyqXmlNode, ...names: string[]): string | null {
  return ayqText(ayqPath(node, ...names));
}

/** Атрибут на възел. */
export function ayqAttr(node: AyqXmlNode, name: string): string | null {
  if (!isRecord(node)) return null;
  const attrs = node.$;
  if (!isRecord(attrs)) return null;
  const value = attrs[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Всички текстове на повтарящ се елемент, ред по ред, непокътнати. */
export function ayqTextList(node: AyqXmlNode, name: string): string[] {
  const out: string[] = [];
  for (const child of ayqChildren(node, name)) {
    const text = ayqText(child);
    if (text !== null) out.push(text);
  }
  return out;
}

/**
 * Рекурсивно търсене на елемент по име, из цялото поддърво.
 *
 * Пази се само за корени, чието разположение зависи от вида на съобщението
 * (camt.053 срещу .052 срещу .054). Обходът на самия запис е изричен по път —
 * сляпото търсене е причината оригиналният парсър да взима <Nm> от пощенския
 * адрес, когато името на страната липсва.
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
