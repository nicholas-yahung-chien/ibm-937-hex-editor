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
  if (!result) {
    return (
      <div className="diag-panel">
        <div className="panel-title">Diagnostics</div>
        <div className="diag-empty">No analysis yet.</div>
      </div>
    );
  }

  const { events, hasProblems, counts } = result;
  const shown = events.filter(shouldShow);

  return (
    <div className="diag-panel">
      <div className="panel-title">
        Diagnostics
        {hasProblems
          ? <span className="diag-badge-err"> ✖ Problems found</span>
          : <span className="diag-badge-ok"> ✔ OK</span>
        }
      </div>

      <div className="diag-summary">
        {(['MISSING_SO', 'MISSING_SI', 'MISSING_SI_AT_EOF', 'AMBIGUOUS', 'INVALID_OR_UNKNOWN'] as DiagnosticKind[]).map(k => (
          counts[k] > 0 && (
            <span key={k} className={`diag-count ${eventClass(k)}`}>
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
