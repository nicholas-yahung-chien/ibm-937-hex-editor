import { useCallback, useEffect, useRef, useState } from 'react';
import type { ByteCell, CursorPos } from '../types';
import { PROBLEM_KINDS, WARNING_KINDS } from '../inspector/inspect937';
import { SO, SI, decodeDbcsPair, decodeSbcsByte } from '../codec/ibm937';

const BYTES_PER_ROW = 16;

interface Props {
  cells: ByteCell[];
  onChange: (cells: ByteCell[]) => void;
}

function cellBg(cell: ByteCell): string {
  if (!cell.diagnostic) return '';
  if (PROBLEM_KINDS.has(cell.diagnostic)) return 'cell-error';
  if (WARNING_KINDS.has(cell.diagnostic)) return 'cell-warn';
  return '';
}

/** Decoded preview text for an SBCS byte; '·' for non-printable control chars. */
function sbcsPreview(b: number): string {
  const t = decodeSbcsByte(b);
  return t.startsWith('[') ? '·' : t;
}

type PreviewKind = 'sbcs' | 'so' | 'si' | 'dbcs-first' | 'dbcs-second' | 'invalid';

interface PreviewEntry {
  kind: PreviewKind;
  text: string;
}

/**
 * Build one PreviewEntry per byte in a line group.
 * dbcs-first carries the decoded glyph; dbcs-second is a placeholder (covered by span).
 */
function buildGroupPreview(cells: ByteCell[]): PreviewEntry[] {
  const entries: PreviewEntry[] = [];
  let inDbcs = false;
  let i = 0;
  while (i < cells.length) {
    const b = cells[i].value;
    if (b === SO) {
      entries.push({ kind: 'so', text: '▶' });
      inDbcs = true; i++; continue;
    }
    if (b === SI) {
      entries.push({ kind: 'si', text: '◀' });
      inDbcs = false; i++; continue;
    }
    if (inDbcs && i + 1 < cells.length) {
      const glyph = decodeDbcsPair(b, cells[i + 1].value) ?? '?';
      entries.push({ kind: 'dbcs-first', text: glyph });
      entries.push({ kind: 'dbcs-second', text: '' });
      i += 2; continue;
    }
    entries.push({ kind: inDbcs ? 'invalid' : 'sbcs', text: inDbcs ? '?' : sbcsPreview(b) });
    i++;
  }
  return entries;
}

export default function HexEditor({ cells, onChange }: Props) {
  const [cursor, setCursor] = useState<CursorPos>({ byteIndex: 0, nibble: 'high' });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cells.length === 0) return;
    setCursor(prev => {
      const maxIdx = cells.length - 1;
      if (prev.byteIndex > maxIdx) return { byteIndex: maxIdx, nibble: 'high' };
      return prev;
    });
  }, [cells.length]);

  const moveCursor = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    if (cells.length === 0) return;
    setCursor(prev => {
      const { byteIndex, nibble } = prev;
      switch (dir) {
        case 'left':
          if (nibble === 'low') return { byteIndex, nibble: 'high' };
          return byteIndex > 0 ? { byteIndex: byteIndex - 1, nibble: 'low' } : prev;
        case 'right':
          if (nibble === 'high') return { byteIndex, nibble: 'low' };
          return byteIndex < cells.length - 1 ? { byteIndex: byteIndex + 1, nibble: 'high' } : prev;
        case 'up':
          return { byteIndex, nibble: 'high' };
        case 'down':
          return { byteIndex, nibble: 'low' };
        default:
          return prev;
      }
    });
  }, [cells.length]);

  const inputNibble = useCallback((hexChar: string) => {
    const digit = parseInt(hexChar, 16);
    if (isNaN(digit)) return;
    const newCells = cells.map((c, idx) => {
      if (idx !== cursor.byteIndex) return c;
      const current = c.value;
      const newVal = cursor.nibble === 'high'
        ? (digit << 4) | (current & 0x0F)
        : (current & 0xF0) | digit;
      return { ...c, value: newVal };
    });
    onChange(newCells);
    setCursor(prev => {
      if (prev.nibble === 'high') return { ...prev, nibble: 'low' };
      if (prev.byteIndex < cells.length - 1) return { byteIndex: prev.byteIndex + 1, nibble: 'high' };
      return prev;
    });
  }, [cursor, cells, onChange]);

  const deleteByte = useCallback(() => {
    if (cells.length === 0) return;
    const newCells = cells.filter((_, idx) => idx !== cursor.byteIndex);
    onChange(newCells);
    setCursor(prev => ({
      byteIndex: Math.min(prev.byteIndex, Math.max(0, newCells.length - 1)),
      nibble: 'high',
    }));
  }, [cursor.byteIndex, cells, onChange]);

  const insertByte = useCallback(() => {
    const insertAt = cursor.byteIndex + 1;
    const newCells: ByteCell[] = [
      ...cells.slice(0, insertAt),
      { value: 0x00 },
      ...cells.slice(insertAt),
    ];
    onChange(newCells);
    setCursor({ byteIndex: insertAt, nibble: 'high' });
  }, [cursor.byteIndex, cells, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveCursor('left');  return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveCursor('right'); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveCursor('up');    return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveCursor('down');  return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteByte(); return; }
    if (e.key === 'Insert') { e.preventDefault(); insertByte(); return; }
    if (/^[0-9a-f]$/.test(key)) { e.preventDefault(); inputNibble(key); }
  }, [moveCursor, deleteByte, insertByte, inputNibble]);

  // Build input-line groups
  const groups: Array<{ startOffset: number; cells: ByteCell[] }> = [];
  cells.forEach((cell, i) => {
    if (i === 0 || cell.lineStart) groups.push({ startOffset: i, cells: [] });
    groups[groups.length - 1].cells.push(cell);
  });

  return (
    <div
      className="hex-editor"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      ref={containerRef}
      aria-label="Hex Editor"
    >
      {cells.length === 0 && (
        <div className="hex-empty">Enter text above and click "Convert" to load bytes.</div>
      )}

      {groups.map((group, gIdx) => {
        // Per-byte preview for the whole group (carries inDbcs across row boundaries)
        const preview = buildGroupPreview(group.cells);

        // Split group into rows of BYTES_PER_ROW
        const rows: Array<{ rowStart: number; rowCells: Array<{ cell: ByteCell; absIdx: number; gi: number }> }> = [];
        for (let r = 0; r < Math.max(group.cells.length, 1); r += BYTES_PER_ROW) {
          rows.push({
            rowStart: group.startOffset + r,
            rowCells: group.cells.slice(r, r + BYTES_PER_ROW).map((cell, ci) => ({
              cell,
              absIdx: group.startOffset + r + ci,
              gi: r + ci,
            })),
          });
        }

        return (
          <div key={gIdx} className="hex-line-group">
            {gIdx > 0 && <div className="hex-line-sep" />}

            {rows.map((row, rowIdx) => {
              const N = row.rowCells.length;

              // Build preview slots: one per logical character (SBCS=1col, DBCS=2col)
              type Slot = { colStart: number; spanCols: number; text: string; cssKind: string };
              const slots: Slot[] = [];
              let ci = 0;
              while (ci < N) {
                const pe = preview[row.rowCells[ci].gi] as PreviewEntry | undefined;
                if (!pe || pe.kind === 'dbcs-second') {
                  // Second byte of a DBCS pair whose first byte is in the previous row → placeholder
                  if (pe?.kind === 'dbcs-second' && ci === 0) {
                    slots.push({ colStart: ci, spanCols: 1, text: '·', cssKind: 'dbcs' });
                  }
                  ci++;
                  continue;
                }
                const wantSpan = pe.kind === 'dbcs-first' ? 2 : 1;
                // Clamp so we don't overflow this row
                const spanCols = ci + wantSpan <= N ? wantSpan : 1;
                slots.push({
                  colStart: ci,
                  spanCols,
                  text: pe.text,
                  cssKind: pe.kind === 'dbcs-first' ? 'dbcs' : pe.kind,
                });
                // Advance past all bytes this slot covers (original wantSpan, not clamped)
                ci += wantSpan;
              }

              return (
                <div key={rowIdx} className="hex-row">
                  <span className="hex-offset">
                    {row.rowStart.toString(16).toUpperCase().padStart(4, '0')}
                  </span>

                  <div
                    className="hex-bytes-grid"
                    style={{ gridTemplateColumns: `repeat(${N}, 1ch)` }}
                  >
                    {/* Grid row 1: UTF-8 preview (read-only) */}
                    {slots.map((slot, si) => (
                      <span
                        key={`p${si}`}
                        className={`hex-preview hex-preview-${slot.cssKind}`}
                        style={{
                          gridRow: 1,
                          gridColumn: slot.spanCols === 2
                            ? `${slot.colStart + 1} / span 2`
                            : `${slot.colStart + 1}`,
                        }}
                        aria-hidden="true"
                      >
                        {slot.text}
                      </span>
                    ))}

                    {/* Grid row 2: High nibbles (editable) */}
                    {row.rowCells.map((rc, colIdx) => {
                      const isActive = cursor.byteIndex === rc.absIdx;
                      const bg = cellBg(rc.cell);
                      return (
                        <span
                          key={`h${colIdx}`}
                          className={[
                            'hex-nibble',
                            isActive ? 'hex-nibble-active' : '',
                            isActive && cursor.nibble === 'high' ? 'nibble-cursor' : '',
                            bg,
                          ].filter(Boolean).join(' ')}
                          style={{ gridRow: 2, gridColumn: colIdx + 1 }}
                          onClick={() => setCursor({ byteIndex: rc.absIdx, nibble: 'high' })}
                        >
                          {((rc.cell.value >> 4) & 0xF).toString(16).toUpperCase()}
                        </span>
                      );
                    })}

                    {/* Grid row 3: Low nibbles (editable) */}
                    {row.rowCells.map((rc, colIdx) => {
                      const isActive = cursor.byteIndex === rc.absIdx;
                      const bg = cellBg(rc.cell);
                      return (
                        <span
                          key={`l${colIdx}`}
                          className={[
                            'hex-nibble',
                            isActive ? 'hex-nibble-active' : '',
                            isActive && cursor.nibble === 'low' ? 'nibble-cursor' : '',
                            bg,
                          ].filter(Boolean).join(' ')}
                          style={{ gridRow: 3, gridColumn: colIdx + 1 }}
                          onClick={() => setCursor({ byteIndex: rc.absIdx, nibble: 'low' })}
                        >
                          {(rc.cell.value & 0xF).toString(16).toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="hex-legend">
        ← → move nibble &nbsp;|&nbsp; ↑ ↓ high/low &nbsp;|&nbsp;
        0-9 a-f input &nbsp;|&nbsp; Del delete byte &nbsp;|&nbsp; Ins insert byte
      </div>
    </div>
  );
}
