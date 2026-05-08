import type { DiagnosticKind } from './inspector/inspect937';

export interface ByteCell {
  value: number;
  diagnostic?: DiagnosticKind;
}

export interface CursorPos {
  byteIndex: number;
  nibble: 'high' | 'low';
}
