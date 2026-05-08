/** SBCS byte (0x00-0xFF) → Unicode code point. */
export declare const SBCS_TO_UNICODE: readonly number[];
/** DBCS pair key ((b1<<8)|b2) → Unicode code point. */
export declare const DBCS_TO_UNICODE: Record<number, number>;
/** Unicode code point → canonical DBCS pair key. */
export declare const UNICODE_TO_DBCS: Record<number, number>;
/** Unicode code point → canonical SBCS byte. */
export declare const UNICODE_TO_SBCS: Record<number, number>;
