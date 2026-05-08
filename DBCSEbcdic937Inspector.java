package com.ibm.systemz.common.jface.hexwidget;

import java.io.PrintStream;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * IBM-937 / Cp937 mixed SBCS + DBCS stream inspector.
 *
 * <p>This version improves the original sample in four practical ways:</p>
 * <ol>
 *   <li>Fixes the public class name so it matches the Java source file name.</li>
 *   <li>Returns structured diagnostic events instead of only printing to stdout.</li>
 *   <li>Records likely missing SO / missing SI situations explicitly.</li>
 *   <li>Caches DBCS pair validation results to avoid repeatedly allocating decoders and buffers.</li>
 * </ol>
 *
 * <p>Important limitation: when SO/SI controls are missing, any recovery is heuristic. Some byte
 * sequences can be valid both as a DBCS pair and as two SBCS bytes. Those cases are reported as
 * AMBIGUOUS instead of being silently treated as certain.</p>
 */
public final class DBCSEbcdic937Inspector {

    private static final int SO = 0x0E;
    private static final int SI = 0x0F;

    private static final Charset IBM937 = resolve937();

    private static final Map<Integer, String> DBCS_PAIR_CACHE = new ConcurrentHashMap<Integer, String>();
    private static final String INVALID_DBCS_PAIR = "\u0000";

    private DBCSEbcdic937Inspector() {
        // Utility class.
    }

    public enum EventType {
        SO,
        SI,
        SBCS,
        DBCS,
        MISSING_SO,
        MISSING_SI,
        MISSING_SI_AT_EOF,
        AMBIGUOUS,
        INVALID_OR_UNKNOWN
    }

    public static final class DiagnosticEvent {
        private final EventType type;
        private final int startOrdinal;
        private final int endOrdinal;
        private final int offset;
        private final int length;
        private final String bytesHex;
        private final String decodedText;
        private final String message;

        private DiagnosticEvent(EventType type, int startOrdinal, int endOrdinal, int offset,
                                int length, String bytesHex, String decodedText, String message) {
            this.type = type;
            this.startOrdinal = startOrdinal;
            this.endOrdinal = endOrdinal;
            this.offset = offset;
            this.length = length;
            this.bytesHex = bytesHex;
            this.decodedText = decodedText;
            this.message = message;
        }

        public EventType getType() { return type; }
        public int getStartOrdinal() { return startOrdinal; }
        public int getEndOrdinal() { return endOrdinal; }
        public int getOffset() { return offset; }
        public int getLength() { return length; }
        public String getBytesHex() { return bytesHex; }
        public String getDecodedText() { return decodedText; }
        public String getMessage() { return message; }

        @Override
        public String toString() {
            String range = startOrdinal == endOrdinal
                    ? "byte " + startOrdinal
                    : "byte " + startOrdinal + "-" + endOrdinal;
            String text = decodedText == null || decodedText.length() == 0 ? "" : " = " + decodedText;
            String note = message == null || message.length() == 0 ? "" : " | " + message;
            return range + " [" + bytesHex + "] " + type + text + note;
        }
    }

    public static final class AnalysisResult {
        private final String label;
        private final List<DiagnosticEvent> events;

        private AnalysisResult(String label, List<DiagnosticEvent> events) {
            this.label = label;
            this.events = Collections.unmodifiableList(new ArrayList<DiagnosticEvent>(events));
        }

        public String getLabel() { return label; }
        public List<DiagnosticEvent> getEvents() { return events; }

        public long count(EventType type) {
            long n = 0;
            for (DiagnosticEvent event : events) {
                if (event.getType() == type) n++;
            }
            return n;
        }

        public boolean hasProblems() {
            for (DiagnosticEvent event : events) {
                switch (event.getType()) {
                    case MISSING_SO:
                    case MISSING_SI:
                    case MISSING_SI_AT_EOF:
                    case AMBIGUOUS:
                    case INVALID_OR_UNKNOWN:
                        return true;
                    default:
                        break;
                }
            }
            return false;
        }

        public void print(PrintStream out) {
            out.println("=== " + (label == null ? "IBM-937 hybrid inspection" : label) + " ===");
            for (DiagnosticEvent event : events) {
                out.println(event);
            }
            out.printf("Summary: missing SO=%d, missing SI=%d, missing SI at EOF=%d, ambiguous=%d, invalid/unknown=%d%n",
                    count(EventType.MISSING_SO),
                    count(EventType.MISSING_SI),
                    count(EventType.MISSING_SI_AT_EOF),
                    count(EventType.AMBIGUOUS),
                    count(EventType.INVALID_OR_UNKNOWN));
        }
    }

    /**
     * Backward-compatible entry point: analyze and print to stdout.
     */
    public static void analyzeHybrid937(byte[] data, String label) {
        inspectHybrid937(data, label).print(System.out);
    }

    /**
     * Analyze a possibly malformed IBM-937 stream and return structured diagnostic events.
     */
    public static AnalysisResult inspectHybrid937(byte[] data, String label) {
        if (data == null) {
            throw new IllegalArgumentException("data must not be null");
        }

        List<DiagnosticEvent> events = new ArrayList<DiagnosticEvent>();
        boolean dbcsMode = false;
        int i = 0;
        int ord = 1;

        while (i < data.length) {
            int b1 = data[i] & 0xFF;

            if (b1 == SO) {
                if (dbcsMode) {
                    events.add(event(EventType.AMBIGUOUS, data, i, 1, ord,
                            "SO encountered while already in DBCS mode; duplicate SO or missing SI before this byte."));
                } else {
                    events.add(event(EventType.SO, data, i, 1, ord, "Enter DBCS mode."));
                }
                dbcsMode = true;
                i++;
                ord++;
                continue;
            }

            if (b1 == SI) {
                if (!dbcsMode) {
                    events.add(event(EventType.AMBIGUOUS, data, i, 1, ord,
                            "SI encountered while already in SBCS mode; duplicate SI or missing SO before this byte."));
                } else {
                    events.add(event(EventType.SI, data, i, 1, ord, "Return to SBCS mode."));
                }
                dbcsMode = false;
                i++;
                ord++;
                continue;
            }

            if (dbcsMode) {
                String dbcsGlyph = decodeDbcsPairIfValid(data, i);
                if (dbcsGlyph != null) {
                    int sbcsRun = strongSbcsRunLength(data, i, 4);
                    if (sbcsRun >= 2) {
                        events.add(event(EventType.AMBIGUOUS, data, i, 2, ord,
                                dbcsGlyph,
                                "Valid DBCS pair, but the same bytes also look like an SBCS run. Keeping DBCS because explicit DBCS mode is active."));
                    } else {
                        events.add(event(EventType.DBCS, data, i, 2, ord, dbcsGlyph, ""));
                    }
                    i += 2;
                    ord += 2;
                    continue;
                }

                if (strongSbcsByte(b1)) {
                    events.add(event(EventType.MISSING_SI, data, i, 1, ord,
                            decodeSbcsByte(data[i]),
                            "Current byte is strong SBCS while DBCS mode is active; inferred missing SI before this byte."));
                    dbcsMode = false;
                    i++;
                    ord++;
                    continue;
                }

                events.add(event(EventType.INVALID_OR_UNKNOWN, data, i, 1, ord,
                        decodeSbcsByte(data[i]),
                        "Not a valid DBCS pair and not a strong SBCS byte; leaving DBCS mode to resynchronize."));
                dbcsMode = false;
                i++;
                ord++;
                continue;
            }

            if (strongSbcsByte(b1) || i == data.length - 1) {
                events.add(event(EventType.SBCS, data, i, 1, ord, decodeSbcsByte(data[i]), ""));
                i++;
                ord++;
                continue;
            }

            String dbcsGlyph = decodeDbcsPairIfValid(data, i);
            if (dbcsGlyph != null) {
                events.add(event(EventType.MISSING_SO, data, i, 2, ord,
                        dbcsGlyph,
                        "Valid DBCS pair while SBCS mode is active; inferred missing SO before this pair."));
                dbcsMode = true;
                i += 2;
                ord += 2;
                continue;
            }

            events.add(event(EventType.INVALID_OR_UNKNOWN, data, i, 1, ord,
                    decodeSbcsByte(data[i]),
                    "Byte is neither strong SBCS nor a valid DBCS pair start."));
            i++;
            ord++;
        }

        if (dbcsMode) {
            events.add(new DiagnosticEvent(EventType.MISSING_SI_AT_EOF, ord, ord, data.length, 0,
                    "", "", "Reached end of data while still in DBCS mode; likely missing SI 0x0F at EOF."));
        }

        return new AnalysisResult(label, events);
    }

    private static Charset resolve937() {
        for (String name : new String[] { "IBM937", "Cp937", "x-IBM937" }) {
            try {
                return Charset.forName(name);
            } catch (RuntimeException ignored) {
                // Try the next alias.
            }
        }
        throw new IllegalStateException("No IBM-937/Cp937 charset is available in this JDK.");
    }

    private static CharsetDecoder strictDecoder() {
        return IBM937.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
    }

    private static String decodeDbcsPairIfValid(byte[] data, int offset) {
        if (offset + 1 >= data.length) return null;

        int key = ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
        String cached = DBCS_PAIR_CACHE.get(key);
        if (cached != null) {
            return INVALID_DBCS_PAIR.equals(cached) ? null : cached;
        }

        String decoded = decodeDbcsPair(data[offset], data[offset + 1]);
        DBCS_PAIR_CACHE.put(key, decoded == null ? INVALID_DBCS_PAIR : decoded);
        return decoded;
    }

    private static String decodeDbcsPair(byte b1, byte b2) {
        byte[] wrapped = new byte[] { SO, b1, b2, SI };
        try {
            CharBuffer cb = strictDecoder().decode(ByteBuffer.wrap(wrapped));
            String s = removeShiftControls(cb.toString());
            if (s.codePointCount(0, s.length()) == 1) {
                int cp = s.codePointAt(0);
                if (isLikelyDbcsCodePoint(cp)) return s;
            }
        } catch (CharacterCodingException ignored) {
            // Invalid DBCS pair.
        }
        return null;
    }

    private static String removeShiftControls(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            if (cp != SO && cp != SI) out.appendCodePoint(cp);
            i += Character.charCount(cp);
        }
        return out.toString();
    }

    /**
     * Strong SBCS heuristic for common IBM-037/IBM-937 single-byte text.
     *
     * <p>This intentionally remains conservative. It accepts EBCDIC letters, digits, space,
     * and common punctuation. Bytes outside this set are not automatically invalid; they are
     * simply not strong evidence for SBCS during missing-SO/SI recovery.</p>
     */
    private static boolean strongSbcsByte(int b) {
        if (b == SO || b == SI) return false;

        // EBCDIC digits and letters, including lowercase.
        if (b >= 0xF0 && b <= 0xF9) return true; // 0-9
        if (b >= 0xC1 && b <= 0xC9) return true; // A-I
        if (b >= 0xD1 && b <= 0xD9) return true; // J-R
        if (b >= 0xE2 && b <= 0xE9) return true; // S-Z
        if (b >= 0x81 && b <= 0x89) return true; // a-i
        if (b >= 0x91 && b <= 0x99) return true; // j-r
        if (b >= 0xA2 && b <= 0xA9) return true; // s-z

        switch (b) {
            case 0x40: // space
            case 0x4B: // . in common EBCDIC mappings
            case 0x6B: // , in common EBCDIC mappings
            case 0x5A: // $ or related punctuation depending on code page
            case 0x7A: // : or related punctuation depending on code page
            case 0x4C: // <
            case 0x50: // &
            case 0x5D: // )
            case 0x5B: // *
            case 0x60: // -
            case 0x61: // /
            case 0x6E: // >
            case 0x6F: // ?
            case 0x7C: // @
            case 0x7E: // =
            case 0x7D: // '
            case 0xBA: // [ in many EBCDIC variants
            case 0xBB: // ] in many EBCDIC variants
                return true;
            default:
                return false;
        }
    }

    private static int strongSbcsRunLength(byte[] data, int offset, int max) {
        int run = 0;
        int end = Math.min(data.length, offset + max);
        for (int i = offset; i < end; i++) {
            int b = data[i] & 0xFF;
            if (b == SO || b == SI || !strongSbcsByte(b)) break;
            run++;
        }
        return run;
    }

    private static boolean isLikelyDbcsCodePoint(int cp) {
        return (cp >= 0x3000 && cp <= 0x30FF)   // CJK punctuation, Kana
                || (cp >= 0x3100 && cp <= 0x312F) // Bopomofo
                || (cp >= 0x31A0 && cp <= 0x31FF) // Bopomofo Extended / Katakana Phonetic Extensions
                || (cp >= 0x3400 && cp <= 0x9FFF) // CJK Unified Ideographs
                || (cp >= 0xF900 && cp <= 0xFAFF) // CJK Compatibility Ideographs
                || (cp >= 0xFF00 && cp <= 0xFFEF); // Fullwidth/Halfwidth Forms
    }

    private static String decodeSbcsByte(byte b) {
        try {
            String s = new String(new byte[] { b }, IBM937);
            return printableFirstCodePoint(s);
        } catch (RuntimeException e) {
            return "?";
        }
    }

    private static DiagnosticEvent event(EventType type, byte[] data, int offset, int length,
                                         int ordinal, String message) {
        return event(type, data, offset, length, ordinal, decodedTextFor(type, data, offset, length), message);
    }

    private static DiagnosticEvent event(EventType type, byte[] data, int offset, int length,
                                         int ordinal, String decodedText, String message) {
        int endOrdinal = length <= 0 ? ordinal : ordinal + length - 1;
        return new DiagnosticEvent(type, ordinal, endOrdinal, offset, length,
                hex(data, offset, length), printable(decodedText), message);
    }

    private static String decodedTextFor(EventType type, byte[] data, int offset, int length) {
        if (length <= 0) return "";
        if (type == EventType.SO) return "SO(0x0E)";
        if (type == EventType.SI) return "SI(0x0F)";
        if (length == 1) return decodeSbcsByte(data[offset]);
        return "";
    }

    private static String hex(byte[] data, int offset, int length) {
        if (length <= 0) return "";
        StringBuilder sb = new StringBuilder(length * 3);
        for (int i = 0; i < length && offset + i < data.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(String.format("%02X", data[offset + i] & 0xFF));
        }
        return sb.toString();
    }

    private static String printable(String s) {
        if (s == null || s.length() == 0) return "";
        return printableFirstCodePoint(s);
    }

    private static String printableFirstCodePoint(String s) {
        if (s == null || s.length() == 0) return "";
        int cp = s.codePointAt(0);
        if (Character.isISOControl(cp)) return String.format("[CTRL U+%04X]", cp);
        return new String(Character.toChars(cp));
    }

    private static byte[] stripSoSi(byte[] in) {
        return strip(in, true, true);
    }

    private static byte[] stripSoOnly(byte[] in) {
        return strip(in, true, false);
    }

    private static byte[] stripSiOnly(byte[] in) {
        return strip(in, false, true);
    }

    private static byte[] strip(byte[] in, boolean removeSo, boolean removeSi) {
        byte[] out = new byte[in.length];
        int p = 0;
        for (byte b : in) {
            int value = b & 0xFF;
            if ((removeSo && value == SO) || (removeSi && value == SI)) continue;
            out[p++] = b;
        }
        byte[] result = new byte[p];
        System.arraycopy(out, 0, result, 0, p);
        return result;
    }

    public static void main(String[] args) {
        byte[] normal = "我住在29號14樓之1".getBytes(IBM937);
        analyzeHybrid937(normal, "normal-937 (with SO/SI)");

        System.out.println();
        analyzeHybrid937(stripSoSi(normal), "stripped-937 (no SO/SI)");

        System.out.println();
        analyzeHybrid937(stripSoOnly(normal), "stripped-937 (no SO)");

        System.out.println();
        analyzeHybrid937(stripSiOnly(normal), "stripped-937 (no SI)");
    }
}
