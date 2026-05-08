import { describe, it, expect } from 'vitest';
import { encodeToIbm937, decodeFromIbm937 } from '../codec/ibm937';
import { inspectIbm937 } from '../inspector/inspect937';

describe('IBM-937 codec', () => {
  it('encodes SBCS ASCII letters', () => {
    const bytes = encodeToIbm937('HELLO');
    // EBCDIC: H=0xC8 E=0xC5 L=0xD3 L=0xD3 O=0xD6
    expect(Array.from(bytes)).toEqual([0xC8, 0xC5, 0xD3, 0xD3, 0xD6]);
  });

  it('encodes digits', () => {
    const bytes = encodeToIbm937('09');
    // EBCDIC: 0=0xF0, 9=0xF9
    expect(Array.from(bytes)).toEqual([0xF0, 0xF9]);
  });

  it('encodes mixed SBCS+DBCS with SO/SI', () => {
    const bytes = encodeToIbm937('A中');
    const arr = Array.from(bytes);
    // A → EBCDIC 0xC1, then SO, DBCS pair for 中, then SI
    expect(arr[0]).toBe(0xC1);
    expect(arr[1]).toBe(0x0E); // SO
    expect(arr[arr.length - 1]).toBe(0x0F); // SI
    // Total: 1 (A) + 1 (SO) + 2 (DBCS) + 1 (SI) = 5
    expect(arr.length).toBe(5);
  });

  it('consecutive DBCS chars share one SO/SI pair', () => {
    const bytes = encodeToIbm937('中文');
    const arr = Array.from(bytes);
    // SO + 2 DBCS + 2 DBCS + SI = 6 bytes
    expect(arr[0]).toBe(0x0E); // SO
    expect(arr[arr.length - 1]).toBe(0x0F); // SI
    expect(arr.length).toBe(6);
  });

  it('round-trips ASCII text', () => {
    const text = 'HELLO WORLD';
    expect(decodeFromIbm937(encodeToIbm937(text))).toBe(text);
  });

  it('round-trips mixed Chinese and ASCII', () => {
    const text = 'ABC中文123';
    expect(decodeFromIbm937(encodeToIbm937(text))).toBe(text);
  });
});

describe('IBM-937 inspector', () => {
  it('detects clean byte stream with no structural errors', () => {
    const bytes = encodeToIbm937('Hello中文World');
    const result = inspectIbm937(bytes);
    // AMBIGUOUS can appear when DBCS pair bytes fall in the strong-SBCS range —
    // that is expected heuristic behaviour (documented in the Java original).
    expect(result.counts.MISSING_SO).toBe(0);
    expect(result.counts.MISSING_SI).toBe(0);
    expect(result.counts.MISSING_SI_AT_EOF).toBe(0);
    expect(result.counts.INVALID_OR_UNKNOWN).toBe(0);
    expect(result.counts.SO).toBeGreaterThan(0);
    expect(result.counts.SI).toBeGreaterThan(0);
  });

  it('detects MISSING_SI_AT_EOF when stream ends in DBCS mode', () => {
    const bytes = encodeToIbm937('A中');
    const stripped = bytes.slice(0, bytes.length - 1); // strip trailing SI
    const result = inspectIbm937(stripped);
    expect(result.counts.MISSING_SI_AT_EOF).toBe(1);
    expect(result.hasProblems).toBe(true);
  });

  it('detects MISSING_SI when a strong-SBCS byte appears inside DBCS mode', () => {
    // 'A中B' → [0xC1, SO, b1, b2, SI, 0xC2]
    // Remove SI → [0xC1, SO, b1, b2, 0xC2]
    // 'B' (0xC2, strong SBCS C1-C9) is now inside DBCS mode → MISSING_SI
    const encoded = Array.from(encodeToIbm937('A中B'));
    const siIdx = encoded.indexOf(0x0F);
    encoded.splice(siIdx, 1);
    const result = inspectIbm937(new Uint8Array(encoded));
    expect(result.counts.MISSING_SI).toBeGreaterThan(0);
    expect(result.hasProblems).toBe(true);
  });

  it('detects problems when SO is stripped from a DBCS stream', () => {
    // 'A中B' → strip SO → DBCS bytes appear raw in SBCS mode → some problem flagged
    const encoded = Array.from(encodeToIbm937('A中B'));
    const soIdx = encoded.indexOf(0x0E);
    encoded.splice(soIdx, 1);
    const result = inspectIbm937(new Uint8Array(encoded));
    expect(result.hasProblems).toBe(true);
  });

  it('reports no problems for a clean SBCS-only stream', () => {
    const bytes = encodeToIbm937('HELLO');
    const result = inspectIbm937(bytes);
    expect(result.hasProblems).toBe(false);
    expect(result.counts.SBCS).toBe(5);
  });
});
