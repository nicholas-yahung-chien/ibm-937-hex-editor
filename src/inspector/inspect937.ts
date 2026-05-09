import { SO, SI, decodeDbcsPair, decodeSbcsByte } from '../codec/ibm937';

export type DiagnosticKind =
  | 'SO'
  | 'SI'
  | 'SBCS'
  | 'DBCS'
  | 'MISSING_SO'
  | 'MISSING_SI'
  | 'MISSING_SI_AT_EOF'
  | 'AMBIGUOUS'
  | 'INVALID_OR_UNKNOWN';

export interface DiagnosticEvent {
  kind: DiagnosticKind;
  /** 1-based byte ordinal of first byte */
  startOrdinal: number;
  /** 1-based byte ordinal of last byte */
  endOrdinal: number;
  /** 0-based byte offset in array */
  offset: number;
  length: number;
  bytesHex: string;
  decodedText: string;
  message: string;
}

export interface AnalysisResult {
  events: readonly DiagnosticEvent[];
  hasProblems: boolean;
  counts: Record<DiagnosticKind, number>;
}

/**
 * Returns true if b is a strong indicator of an SBCS byte in IBM-937.
 * Port of DBCSEbcdic937Inspector.strongSbcsByte().
 */
function strongSbcsByte(b: number): boolean {
  if (b === SO || b === SI) return false;
  // Bytes below the DBCS pair range (0x40-0xFE) can never be DBCS bytes.
  // This covers all EBCDIC control characters including NL (0x15), LF (0x25), CR (0x0D).
  if (b < 0x40) return true;
  if (b === 0xFF) return true;
  if (b >= 0xF0 && b <= 0xF9) return true; // 0-9
  if (b >= 0xC1 && b <= 0xC9) return true; // A-I
  if (b >= 0xD1 && b <= 0xD9) return true; // J-R
  if (b >= 0xE2 && b <= 0xE9) return true; // S-Z
  if (b >= 0x81 && b <= 0x89) return true; // a-i
  if (b >= 0x91 && b <= 0x99) return true; // j-r
  if (b >= 0xA2 && b <= 0xA9) return true; // s-z
  switch (b) {
    case 0x40: // space
    case 0x4B: // .
    case 0x6B: // ,
    case 0x5A: // !
    case 0x7A: // :
    case 0x4C: // <
    case 0x50: // &
    case 0x5D: // )
    case 0x5B: // $
    case 0x60: // -
    case 0x61: // /
    case 0x6E: // >
    case 0x6F: // ?
    case 0x7C: // @
    case 0x7E: // =
    case 0x7D: // '
    case 0xBA: // [
    case 0xBB: // ]
      return true;
    default:
      return false;
  }
}

function strongSbcsRunLength(data: Uint8Array, offset: number, max: number): number {
  let run = 0;
  const end = Math.min(data.length, offset + max);
  for (let i = offset; i < end; i++) {
    const b = data[i];
    if (b === SO || b === SI || !strongSbcsByte(b)) break;
    run++;
  }
  return run;
}

function toHex(data: Uint8Array, offset: number, length: number): string {
  const parts: string[] = [];
  for (let i = 0; i < length && offset + i < data.length; i++) {
    parts.push(data[offset + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function makeEvent(
  kind: DiagnosticKind,
  data: Uint8Array,
  offset: number,
  length: number,
  ordinal: number,
  decodedText: string,
  message: string,
): DiagnosticEvent {
  const endOrdinal = length <= 0 ? ordinal : ordinal + length - 1;
  return {
    kind,
    startOrdinal: ordinal,
    endOrdinal,
    offset,
    length,
    bytesHex: toHex(data, offset, length),
    decodedText,
    message,
  };
}

/**
 * Inspect a potentially malformed IBM-937 byte stream.
 * Port of DBCSEbcdic937Inspector.inspectHybrid937().
 */
export function inspectIbm937(data: Uint8Array): AnalysisResult {
  const events: DiagnosticEvent[] = [];
  let dbcsMode = false;
  let i = 0;
  let ord = 1;

  while (i < data.length) {
    const b1 = data[i];

    if (b1 === SO) {
      if (dbcsMode) {
        events.push(makeEvent('AMBIGUOUS', data, i, 1, ord,
          'SO', 'SO found while already in DBCS mode; duplicate SO or missing SI.'));
      } else {
        events.push(makeEvent('SO', data, i, 1, ord, 'SO', 'Enter DBCS mode.'));
      }
      dbcsMode = true;
      i++; ord++;
      continue;
    }

    if (b1 === SI) {
      if (!dbcsMode) {
        events.push(makeEvent('AMBIGUOUS', data, i, 1, ord,
          'SI', 'SI found while already in SBCS mode; duplicate SI or missing SO.'));
      } else {
        events.push(makeEvent('SI', data, i, 1, ord, 'SI', 'Return to SBCS mode.'));
      }
      dbcsMode = false;
      i++; ord++;
      continue;
    }

    if (dbcsMode) {
      const glyph = i + 1 < data.length ? decodeDbcsPair(b1, data[i + 1]) : null;
      if (glyph !== null) {
        const sbcsRun = strongSbcsRunLength(data, i, 4);
        if (sbcsRun >= 2) {
          events.push(makeEvent('AMBIGUOUS', data, i, 2, ord, glyph,
            'Valid DBCS pair, but bytes also look like SBCS run. Keeping DBCS (explicit mode active).'));
        } else {
          events.push(makeEvent('DBCS', data, i, 2, ord, glyph, ''));
        }
        i += 2; ord += 2;
        continue;
      }

      if (strongSbcsByte(b1)) {
        events.push(makeEvent('MISSING_SI', data, i, 1, ord,
          decodeSbcsByte(b1),
          'Strong SBCS byte found in DBCS mode; inferred missing SI before this byte.'));
        dbcsMode = false;
        i++; ord++;
        continue;
      }

      events.push(makeEvent('INVALID_OR_UNKNOWN', data, i, 1, ord,
        decodeSbcsByte(b1),
        'Not a valid DBCS pair and not a strong SBCS byte; leaving DBCS mode.'));
      dbcsMode = false;
      i++; ord++;
      continue;
    }

    // SBCS mode
    if (strongSbcsByte(b1) || i === data.length - 1) {
      events.push(makeEvent('SBCS', data, i, 1, ord, decodeSbcsByte(b1), ''));
      i++; ord++;
      continue;
    }

    const glyph = i + 1 < data.length ? decodeDbcsPair(b1, data[i + 1]) : null;
    if (glyph !== null) {
      events.push(makeEvent('MISSING_SO', data, i, 2, ord, glyph,
        'Valid DBCS pair found in SBCS mode; inferred missing SO before this pair.'));
      dbcsMode = true;
      i += 2; ord += 2;
      continue;
    }

    events.push(makeEvent('INVALID_OR_UNKNOWN', data, i, 1, ord,
      decodeSbcsByte(b1),
      'Byte is neither a strong SBCS byte nor a valid DBCS pair start.'));
    i++; ord++;
  }

  if (dbcsMode) {
    events.push({
      kind: 'MISSING_SI_AT_EOF',
      startOrdinal: ord,
      endOrdinal: ord,
      offset: data.length,
      length: 0,
      bytesHex: '',
      decodedText: '',
      message: 'End of data reached while still in DBCS mode; likely missing SI (0x0F) at EOF.',
    });
  }

  const counts: Record<DiagnosticKind, number> = {
    SO: 0, SI: 0, SBCS: 0, DBCS: 0,
    MISSING_SO: 0, MISSING_SI: 0, MISSING_SI_AT_EOF: 0,
    AMBIGUOUS: 0, INVALID_OR_UNKNOWN: 0,
  };
  for (const e of events) counts[e.kind]++;

  const hasProblems = (
    counts.MISSING_SO > 0 ||
    counts.MISSING_SI > 0 ||
    counts.MISSING_SI_AT_EOF > 0 ||
    counts.AMBIGUOUS > 0 ||
    counts.INVALID_OR_UNKNOWN > 0
  );

  return { events, hasProblems, counts };
}

export const PROBLEM_KINDS = new Set<DiagnosticKind>([
  'MISSING_SO', 'MISSING_SI', 'MISSING_SI_AT_EOF', 'INVALID_OR_UNKNOWN',
]);
export const WARNING_KINDS = new Set<DiagnosticKind>(['AMBIGUOUS']);
