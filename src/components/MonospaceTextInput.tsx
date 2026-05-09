import { useRef, useState } from 'react';

function isWideChar(char: string): boolean {
  const cp = char.codePointAt(0)!;
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||  // Hangul Jamo
    (cp >= 0x2E80 && cp <= 0x303F) ||  // CJK Radicals, CJK Symbols & Punctuation
    (cp >= 0x3040 && cp <= 0x33FF) ||  // Kana, Bopomofo, CJK Compat
    (cp >= 0x3400 && cp <= 0x4DBF) ||  // CJK Extension A
    (cp >= 0x4E00 && cp <= 0x9FFF) ||  // CJK Unified Ideographs
    (cp >= 0xA000 && cp <= 0xA4CF) ||  // Yi Syllables
    (cp >= 0xAC00 && cp <= 0xD7AF) ||  // Hangul Syllables
    (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK Compat Ideographs
    (cp >= 0xFE10 && cp <= 0xFE6F) ||  // Vert Forms, CJK Compat Forms, Small Forms
    (cp >= 0xFF00 && cp <= 0xFF60) ||  // Fullwidth ASCII & Halfwidth Katakana
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||  // Fullwidth Signs
    (cp >= 0x20000 && cp <= 0x2CEAF)   // CJK Extension B–E
  );
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}

export default function MonospaceTextInput({ value, onChange, rows = 6, placeholder }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const renderLines = () =>
    value.split('\n').map((line, li) => {
      const chars = [...line];
      return (
        <div key={li} className="mc-line">
          {chars.length === 0
            ? <span className="mc-char mc-narrow">{' '}</span>
            : chars.map((char, ci) => (
                <span key={ci} className={isWideChar(char) ? 'mc-char mc-wide' : 'mc-char mc-narrow'}>
                  {char}
                </span>
              ))
          }
        </div>
      );
    });

  return (
    <div
      className={['mc-container', focused ? 'mc-focused' : ''].filter(Boolean).join(' ')}
      onClick={() => textareaRef.current?.focus()}
    >
      <div className="mc-display" aria-hidden="true">
        {value
          ? renderLines()
          : <span className="mc-placeholder">{placeholder}</span>
        }
      </div>
      <textarea
        ref={textareaRef}
        className="mc-capture"
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="UTF-8 text input"
      />
    </div>
  );
}
