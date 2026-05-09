import { useState } from 'react';
import type { AnalysisResult, DiagnosticEvent, DiagnosticKind } from '../inspector/inspect937';
import { PROBLEM_KINDS, WARNING_KINDS } from '../inspector/inspect937';

interface Props {
  result: AnalysisResult | null;
}

function eventClass(kind: DiagnosticKind): string {
  if (PROBLEM_KINDS.has(kind)) return 'diag-error';
  if (WARNING_KINDS.has(kind)) return 'diag-warn';
  return 'diag-info';
}

function shouldShow(e: DiagnosticEvent): boolean {
  return e.kind !== 'SBCS' && e.kind !== 'DBCS';
}

export default function DiagnosticsPanel({ result }: Props) {
  const [showWarnings, setShowWarnings] = useState(true);

  if (!result) {
    return (
      <div className="diag-panel">
        <div className="panel-title">Diagnostics</div>
        <div className="diag-empty">No analysis yet.</div>
      </div>
    );
  }

  const { events, counts } = result;

  const errorOnly =
    counts.MISSING_SO > 0 ||
    counts.MISSING_SI > 0 ||
    counts.MISSING_SI_AT_EOF > 0 ||
    counts.INVALID_OR_UNKNOWN > 0;

  const effectiveHasProblems = showWarnings ? result.hasProblems : errorOnly;

  const shown = events.filter(
    e => shouldShow(e) && (showWarnings || !WARNING_KINDS.has(e.kind))
  );

  return (
    <div className="diag-panel">
      <div className="panel-title">
        Diagnostics
        {effectiveHasProblems
          ? <span className="diag-badge-err"> ✖ Problems found</span>
          : <span className="diag-badge-ok"> ✔ OK</span>
        }
        <label className="diag-warn-toggle" title="Include AMBIGUOUS warnings in problem count and list">
          <input
            type="checkbox"
            checked={showWarnings}
            onChange={e => setShowWarnings(e.target.checked)}
          />
          {' '}WARN
        </label>
      </div>

      <div className="diag-summary">
        {(['MISSING_SO', 'MISSING_SI', 'MISSING_SI_AT_EOF', 'AMBIGUOUS', 'INVALID_OR_UNKNOWN'] as DiagnosticKind[]).map(k => (
          counts[k] > 0 && (
            <span
              key={k}
              className={`diag-count ${eventClass(k)}${!showWarnings && WARNING_KINDS.has(k) ? ' diag-count-muted' : ''}`}
            >
              {k}: {counts[k]}
            </span>
          )
        ))}
        <span className="diag-count diag-info">SO: {counts.SO}</span>
        <span className="diag-count diag-info">SI: {counts.SI}</span>
        <span className="diag-count diag-info">SBCS: {counts.SBCS}</span>
        <span className="diag-count diag-info">DBCS: {counts.DBCS}</span>
      </div>

      {shown.length === 0 ? (
        <div className="diag-empty">No SO/SI issues detected.</div>
      ) : (
        <ul className="diag-list">
          {shown.map((e, i) => (
            <li key={i} className={`diag-item ${eventClass(e.kind)}`}>
              <span className="diag-pos">byte {e.startOrdinal}{e.startOrdinal !== e.endOrdinal ? `–${e.endOrdinal}` : ''}</span>
              <span className="diag-hex">[{e.bytesHex}]</span>
              <span className="diag-kind">{e.kind}</span>
              {e.decodedText && <span className="diag-char">{e.decodedText}</span>}
              {e.message && <span className="diag-msg">{e.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
