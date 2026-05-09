import { useState } from 'react';
import { encodeToIbm937 } from '../codec/ibm937';
import type { ByteCell } from '../types';
import MonospaceTextInput from './MonospaceTextInput';

interface Props {
  onConvert: (cells: ByteCell[]) => void;
}

export default function Utf8InputPanel({ onConvert }: Props) {
  const [text, setText] = useState('');

  const handleConvert = () => {
    const inputLines = text.split('\n');
    const cells: ByteCell[] = [];
    inputLines.forEach((line, lineIdx) => {
      Array.from(encodeToIbm937(line)).forEach((v, byteIdx) => {
        cells.push({ value: v, lineStart: lineIdx > 0 && byteIdx === 0 });
      });
    });
    onConvert(cells);
  };

  return (
    <div className="panel input-panel">
      <div className="panel-title">UTF-8 Input</div>
      <MonospaceTextInput
        value={text}
        onChange={setText}
        placeholder="Enter text here…"
        rows={6}
      />
      <button className="convert-btn" onClick={handleConvert}>
        Convert → IBM-937
      </button>
      <div className="panel-hint">
        DBCS characters will be wrapped with SO (0E) / SI (0F).
      </div>
    </div>
  );
}
