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
    const bytes = encodeToIbm937(text.replace(/\r?\n/g, ''));
    const cells: ByteCell[] = Array.from(bytes).map(v => ({ value: v }));
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
