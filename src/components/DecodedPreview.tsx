import { SO, SI, decodeDbcsPair, decodeSbcsByte } from '../codec/ibm937';
import type { ByteCell } from '../types';

interface Props {
  cells: ByteCell[];
}

interface Segment {
  kind: 'sbcs' | 'dbcs' | 'so' | 'si' | 'invalid';
  text: string;
}

function buildSegments(cells: ByteCell[]): Segment[] {
  const segs: Segment[] = [];
  let i = 0;
  let inDbcs = false;
  const bytes = cells.map(c => c.value);

  while (i < bytes.length) {
    const b = bytes[i];

    if (b === SO) {
      segs.push({ kind: 'so', text: '▶' });
      inDbcs = true;
      i++;
      continue;
    }
    if (b === SI) {
      segs.push({ kind: 'si', text: '◀' });
      inDbcs = false;
      i++;
      continue;
    }

    if (inDbcs) {
      if (i + 1 < bytes.length) {
        const glyph = decodeDbcsPair(b, bytes[i + 1]);
        if (glyph !== null) {
          segs.push({ kind: 'dbcs', text: glyph });
          i += 2;
        } else {
          segs.push({ kind: 'invalid', text: '???' });
          i += 2;
        }
      } else {
        segs.push({ kind: 'invalid', text: '?' });
        i++;
      }
      continue;
    }

    segs.push({ kind: 'sbcs', text: decodeSbcsByte(b) });
    i++;
  }

  return segs;
}

export default function DecodedPreview({ cells }: Props) {
  if (cells.length === 0) {
    return (
      <div className="panel preview-panel">
        <div className="panel-title">UTF-8 Preview</div>
        <div className="preview-empty">Preview will appear here after conversion.</div>
      </div>
    );
  }

  // Split cells into input-line groups based on lineStart markers
  const lineGroups: ByteCell[][] = [];
  cells.forEach((cell, i) => {
    if (i === 0 || cell.lineStart) lineGroups.push([]);
    lineGroups[lineGroups.length - 1].push(cell);
  });

  return (
    <div className="panel preview-panel">
      <div className="panel-title">UTF-8 Preview</div>
      <div className="preview-content">
        {lineGroups.map((group, gIdx) => (
          <div key={gIdx} className="preview-line">
            {buildSegments(group).map((seg, i) => (
              <span key={i} className={`seg-${seg.kind}`} title={seg.kind}>
                {seg.text}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="preview-legend">
        <span className="seg-so">▶</span> SO &nbsp;
        <span className="seg-si">◀</span> SI &nbsp;
        <span className="seg-sbcs">A</span> SBCS &nbsp;
        <span className="seg-dbcs">漢</span> DBCS
      </div>
    </div>
  );
}
