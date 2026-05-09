import { useCallback, useEffect, useRef, useState } from 'react';
import type { ByteCell, CursorPos } from '../types';
import { PROBLEM_KINDS, WARNING_KINDS } from '../inspector/inspect937';

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

export default function HexEditor({ cells, onChange }: Props) {
  const [cursor, setCursor] = useState<CursorPos>({ byteIndex: 0, nibble: 'high' });
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep cursor in bounds when cells change
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

    // Auto-advance: high → low → next high
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

    if (e.key === 'ArrowLeft') { e.preventDefault(); moveCursor('left'); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveCursor('right'); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor('up'); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor('down'); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteByte(); return; }
    if (e.key === 'Insert') { e.preventDefault(); insertByte(); return; }

    if (/^[0-9a-f]$/.test(key)) {
      e.preventDefault();
      inputNibble(key);
    }
  }, [moveCursor, deleteByte, insertByte, inputNibble]);

  const rows: ByteCell[][] = [];
  for (let r = 0; r < cells.length; r += BYTES_PER_ROW) {
    rows.push(cells.slice(r, r + BYTES_PER_ROW));
  }

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
      {rows.map((row, rowIdx) => {
        const rowStart = rowIdx * BYTES_PER_ROW;
        return (
          <div key={rowIdx} className="hex-row">
            <span className="hex-offset">
              {rowStart.toString(16).toUpperCase().padStart(4, '0')}
            </span>

            {/* Each byte is a vertical column: high nibble on top, low nibble below */}
            <div className="hex-bytes">
              {row.map((cell, colIdx) => {
                const absIdx = rowStart + colIdx;
                const isActive = cursor.byteIndex === absIdx;
                const bg = cellBg(cell);
                return (
                  <div key={colIdx} className={['hex-byte-col', isActive ? 'hex-byte-active' : '', bg].filter(Boolean).join(' ')}>
                    <span
                      className={['hex-nibble', 'nibble-high', isActive && cursor.nibble === 'high' ? 'nibble-cursor' : ''].filter(Boolean).join(' ')}
                      onClick={() => setCursor({ byteIndex: absIdx, nibble: 'high' })}
                    >
                      {((cell.value >> 4) & 0xF).toString(16).toUpperCase()}
                    </span>
                    <span
                      className={['hex-nibble', 'nibble-low', isActive && cursor.nibble === 'low' ? 'nibble-cursor' : ''].filter(Boolean).join(' ')}
                      onClick={() => setCursor({ byteIndex: absIdx, nibble: 'low' })}
                    >
                      {(cell.value & 0xF).toString(16).toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
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
