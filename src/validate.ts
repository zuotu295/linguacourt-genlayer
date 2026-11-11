// Pure input validation for LinguaCourt writes, mirroring the contract's
// bounds in contracts/linguacourt.py exactly. Runs BEFORE any payable
// send: on Studionet a FAILED payable call does NOT refund its value, so
// the frontend must reject out-of-bounds input locally instead of letting
// 10 GEN strand on-chain (see README "Known limitations").
//
// Counting is by Unicode CODE POINT ([...s].length), matching Python
// len() in the contract. JS .length counts UTF-16 units and differs on
// astral characters (emoji): e.g. '😀'.repeat(1001) is 1001 code points
// (valid) but 2002 UTF-16 units (would wrongly fail a .length check).
//
// Contract bounds (create_case / submit_translation):
//   source:      len(stripped) in 20..2000            (SOURCE_TEXT)
//   target_lang: one of TARGET_LANGS                  (TARGET_LANG)
//   brief:       len(raw) <= 500                      (BRIEF; checked before strip)
//   translator:  0x + 40 hex chars, != client         (TRANSLATOR_ADDRESS / TRANSLATOR_MUST_DIFFER)
//   translation: len(stripped) in 10..2000            (TRANSLATION)
import { TARGET_LANGS } from './chain';

export const cpLen = (s: string): number => [...s].length;

export const SOURCE_MIN = 20;
export const SOURCE_MAX = 2000;
export const BRIEF_MAX = 500;
export const TRANSLATION_MIN = 10;
export const TRANSLATION_MAX = 2000;

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// Per-field checks; each returns a bilingual error message or null.
// The combined create check below applies them in contract order.
export function sourceError(source: string): string | null {
  const n = cpLen(source.trim());
  if (n < SOURCE_MIN || n > SOURCE_MAX) {
    return `Source text must be 20–2000 characters (now ${n}). / 原文需 20–2000 字（当前 ${n} 字）。`;
  }
  return null;
}

export function targetError(target: string): string | null {
  if (!TARGET_LANGS.includes(target)) {
    return 'Target language is not supported. / 目标语言不在支持列表中。';
  }
  return null;
}

export function briefError(brief: string): string | null {
  const n = cpLen(brief);
  if (n > BRIEF_MAX) {
    return `Brief must be at most 500 characters (now ${n}). / 简述最多 500 字（当前 ${n} 字）。`;
  }
  return null;
}

export function translatorError(translator: string, client: string): string | null {
  const addr = translator.trim();
  if (!ADDR_RE.test(addr)) {
    return 'Designated translator address must be a 0x 42-char hex address. / 指定译者地址必须是 0x 开头的 42 位十六进制地址。';
  }
  if (client && addr.toLowerCase() === client.toLowerCase()) {
    return 'Translator must differ from the client. / 译者不能是客户本人。';
  }
  return null;
}

export function translationError(text: string): string | null {
  const n = cpLen(text.trim());
  if (n < TRANSLATION_MIN || n > TRANSLATION_MAX) {
    return `Translation must be 10–2000 characters (now ${n}). / 译文需 10–2000 字（当前 ${n} 字）。`;
  }
  return null;
}

export interface CreateInput {
  source: string;
  target: string;
  brief: string;
  translator: string;
  client: string;
}

// First failing check in contract order, or null when all inputs are valid.
// This is the gate onCreate must call before any doWrite (payable) send.
export function validateCreate(input: CreateInput): string | null {
  return (
    sourceError(input.source) ||
    targetError(input.target) ||
    briefError(input.brief) ||
    translatorError(input.translator, input.client) ||
    null
  );
}

// Gate onSubmitTr must call before any doWrite (no value attached, but a
// failed call still wastes a consensus round and confuses the docket).
export function validateTranslation(text: string): string | null {
  return translationError(text);
}
