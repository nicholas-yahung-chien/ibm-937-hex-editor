import { useCallback, useState } from 'react';
import type { ByteCell } from './types';
import { inspectIbm937 } from './inspector/inspect937';
import type { AnalysisResult } from './inspector/inspect937';
import Utf8InputPanel from './components/Utf8InputPanel';
import HexEditor from './components/HexEditor';
import DecodedPreview from './components/DecodedPreview';
import DiagnosticsPanel from './components/DiagnosticsPanel';

export default function App() {
  const [cells, setCells] = useState<ByteCell[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const runInspection = useCallback((raw: ByteCell[]) => {
    if (raw.length === 0) {
      setAnalysisResult(null);
      return;
    }
    const bytes = new Uint8Array(raw.map(c => c.value));
    const result = inspectIbm937(bytes);

    // Annotate cells with diagnostics
    const annotated: ByteCell[] = raw.map(c => ({ ...c, diagnostic: undefined }));
    for (const event of result.events) {
      for (let j = 0; j < event.length; j++) {
        const idx = event.offset + j;
        if (idx < annotated.length) {
          annotated[idx] = { ...annotated[idx], diagnostic: event.kind };
        }
      }
    }

    setCells(annotated);
    setAnalysisResult(result);
  }, []);

  const handleConvert = useCallback((newCells: ByteCell[]) => {
    runInspection(newCells);
  }, [runInspection]);

  const handleCellsChange = useCallback((newCells: ByteCell[]) => {
    // Strip diagnostic annotations before re-inspecting
    const raw = newCells.map(c => ({ value: c.value }));
    runInspection(raw);
  }, [runInspection]);

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">IBM-937 DBCS Hex Inspector</span>
        <span className="app-subtitle">ISPF-style hex editor with SO/SI diagnostics</span>
      </header>

      <main className="app-main">
        <div className="top-panels">
          <Utf8InputPanel onConvert={handleConvert} />
          <div className="panel hex-panel">
            <div className="panel-title">Hex Editor</div>
            <HexEditor cells={cells} onChange={handleCellsChange} />
          </div>
          <DecodedPreview cells={cells} />
        </div>

        <DiagnosticsPanel result={analysisResult} />
      </main>
    </div>
  );
}
