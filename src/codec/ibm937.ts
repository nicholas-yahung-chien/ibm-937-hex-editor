import { SBCS_TO_UNICODE, UNICODE_TO_SBCS, DBCS_TO_UNICODE, UNICODE_TO_DBCS } from './tables';

export const SO = 0x0E;
export const SI = 0x0F;

/** Encode a UTF-8 string to IBM-937 bytes (with SO/SI for DBCS runs). */
export function encodeToIbm937(text: string): Uint8Array {
  const out: number[] = [];
  let inDbcs = false;

  for (const char of text) {
    const cp = char.codePointAt(0)!;

    const dbcsPair = UNICODE_TO_DBCS[cp];
    if (dbcsPair !== undefined) {
      if (!inDbcs) {
        out.push(SO);
        inDbcs = true;
      }
      out.push((dbcsPair >> 8) & 0xFF, dbcsPair & 0xFF);
      continue;
    }

    const sbcsByte = UNICODE_TO_SBCS[cp];
    if (sbcsByte !== undefined) {
      if (inDbcs) {
        out.push(SI);
        inDbcs = false;
      }
      out.push(sbcsByte);
      continue;
    }

    // Unencodable: emit substitution byte 0x3F (SUB in EBCDIC)
    if (inDbcs) {
      out.push(SI);
      inDbcs = false;
    }
    out.push(0x3F);
  }

  if (inDbcs) out.push(SI);

  return new Uint8Array(out);
}

/** Decode IBM-937 bytes to a UTF-8 string. */
export function decodeFromIbm937(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  let inDbcs = false;

  while (i < bytes.length) {
    const b = bytes[i];

    if (b === SO) {
      inDbcs = true;
      i++;
      continue;
    }
    if (b === SI) {
      inDbcs = false;
      i++;
      continue;
    }

    if (inDbcs) {
      if (i + 1 < bytes.length) {
        const key = (b << 8) | bytes[i + 1];
        const cp = DBCS_TO_UNICODE[key];
        result += cp !== undefined ? String.fromCodePoint(cp) : '�';
        i += 2;
      } else {
        result += '�';
        i++;
      }
      continue;
    }

    const cp = SBCS_TO_UNICODE[b];
    result += cp !== undefined ? String.fromCodePoint(cp) : '�';
    i++;
  }

  return result;
}

/** Check whether a (b1, b2) pair is a valid IBM-937 DBCS pair. */
export function isValidDbcsPair(b1: number, b2: number): boolean {
  const key = (b1 << 8) | b2;
  return DBCS_TO_UNICODE[key] !== undefined;
}

/** Decode a single DBCS pair to its Unicode character, or null if invalid. */
export function decodeDbcsPair(b1: number, b2: number): string | null {
  const key = (b1 << 8) | b2;
  const cp = DBCS_TO_UNICODE[key];
  return cp !== undefined ? String.fromCodePoint(cp) : null;
}

/** Decode a single SBCS byte to its Unicode character. */
export function decodeSbcsByte(b: number): string {
  const cp = SBCS_TO_UNICODE[b];
  if (cp === undefined) return '�';
  if (cp < 0x20 || (cp >= 0x7F && cp < 0xA0)) {
    return `[${cp.toString(16).toUpperCase().padStart(4, '0')}]`;
  }
  return String.fromCodePoint(cp);
}
