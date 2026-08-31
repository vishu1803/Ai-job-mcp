/**
 * @file Deterministic Resume & Experience Date Range Normalizer
 *
 * Parses natural-language and formatted date ranges commonly found in resumes:
 * - "June 2024 – September 2024"
 * - "06/2024 - 09/2024"
 * - "2022 - Present"
 * - "05/2021 - Present"
 * - "Summer 2024"
 * - "2024"
 * - "2024 – 2025"
 * - "Jan 2020 - Dec 2021"
 * - "March 2023 - Current"
 * - "Q1 2023 - Q3 2023"
 * - "Fall 2022"
 * - "Spring 2024"
 *
 * Invariants:
 * - Never invents day precision (yields YYYY-MM or YYYY)
 * - isCurrent === true implies endDate === null
 * - Preserves rawDateRange for exact text display
 * - Handles non-standard unicode dashes (–, —, -)
 * - Falls back safely with isUncertain: true when dates cannot be parsed
 */

const MONTH_NAMES = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const SEASON_MONTHS = {
  spring: { start: 3, end: 5 },
  summer: { start: 6, end: 8 },
  fall: { start: 9, end: 11 },
  autumn: { start: 9, end: 11 },
  winter: { start: 12, end: 2 },
};

const QUARTER_MONTHS = {
  q1: { start: 1, end: 3 },
  q2: { start: 4, end: 6 },
  q3: { start: 7, end: 9 },
  q4: { start: 10, end: 12 },
};

/**
 * Pads month to two digits (1 -> "01", 12 -> "12").
 *
 * @param {number} m
 * @returns {string}
 */
function pad2(m) {
  return String(m).padStart(2, '0');
}

/**
 * Normalizes a single date token (e.g. "June 2024", "06/2024", "2024", "Present", "Summer 2024").
 *
 * @param {string} token
 * @returns {{ year: number | null, month: number | null, isCurrent: boolean, isYearOnly: boolean, seasonInfo?: object, quarterInfo?: object } | null}
 */
function parseSingleDateToken(token) {
  if (!token || typeof token !== 'string') return null;
  const raw = token.trim();
  const lower = raw.toLowerCase();

  if (/^(?:present|current|now|ongoing|till\s*date|to\s*date|active)$/i.test(lower)) {
    return { year: null, month: null, isCurrent: true, isYearOnly: false };
  }

  // 1. Month Name + Year (e.g. "June 2024", "Jun 2024", "September 2023", "Jun '24", "June, 2024")
  const monthNameYearMatch = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[,.\s]+(?:'?(\d{2,4}))\b/i
  );
  if (monthNameYearMatch) {
    const mStr = monthNameYearMatch[1];
    let yStr = monthNameYearMatch[2];
    if (yStr.length === 2) {
      const yNum = parseInt(yStr, 10);
      yStr = String(yNum < 70 ? 2000 + yNum : 1900 + yNum);
    }
    const year = parseInt(yStr, 10);
    const month = MONTH_NAMES[mStr] || null;
    return { year, month, isCurrent: false, isYearOnly: false };
  }

  // 2. Numeric Month / Year (e.g. "06/2024", "6/2024", "06.2024", "06-2024", "2024/06", "2024-06")
  const numericMatch1 = lower.match(/\b(0?[1-9]|1[0-2])[/.-](\d{4})\b/);
  if (numericMatch1) {
    const month = parseInt(numericMatch1[1], 10);
    const year = parseInt(numericMatch1[2], 10);
    return { year, month, isCurrent: false, isYearOnly: false };
  }

  const numericMatch2 = lower.match(/\b(\d{4})[/.-](0?[1-9]|1[0-2])\b/);
  if (numericMatch2) {
    const year = parseInt(numericMatch2[1], 10);
    const month = parseInt(numericMatch2[2], 10);
    return { year, month, isCurrent: false, isYearOnly: false };
  }

  // 3. Season + Year (e.g. "Summer 2024", "Fall 2023", "Spring 2022", "Winter 2021")
  const seasonMatch = lower.match(/\b(spring|summer|fall|autumn|winter)\s+(\d{4})\b/i);
  if (seasonMatch) {
    const season = seasonMatch[1];
    const year = parseInt(seasonMatch[2], 10);
    const sInfo = SEASON_MONTHS[season];
    return { year, month: sInfo.start, isCurrent: false, isYearOnly: false, seasonInfo: sInfo };
  }

  // 4. Quarter + Year (e.g. "Q1 2023", "Q3 2024")
  const quarterMatch = lower.match(/\b(q[1-4])\s+(\d{4})\b/i);
  if (quarterMatch) {
    const q = quarterMatch[1];
    const year = parseInt(quarterMatch[2], 10);
    const qInfo = QUARTER_MONTHS[q];
    return { year, month: qInfo.start, isCurrent: false, isYearOnly: false, quarterInfo: qInfo };
  }

  // 5. Year only (e.g. "2024", "1998")
  const yearOnlyMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    return { year, month: null, isCurrent: false, isYearOnly: true };
  }

  return null;
}

export class DateRangeNormalizer {
  /**
   * Parses a raw date string or date range into structured canonical bounds.
   *
   * @param {string} rawInput
   * @returns {{
   *   startDate: string | null,
   *   endDate: string | null,
   *   isCurrent: boolean,
   *   rawDateRange: string,
   *   startYear: number | null,
   *   startMonth: number | null,
   *   endYear: number | null,
   *   endMonth: number | null,
   *   isUncertain: boolean
   * }}
   */
  static normalize(rawInput) {
    const rawDateRange = String(rawInput || '').trim();
    if (!rawDateRange) {
      return {
        startDate: null,
        endDate: null,
        isCurrent: false,
        rawDateRange: '',
        startYear: null,
        startMonth: null,
        endYear: null,
        endMonth: null,
        isUncertain: true,
      };
    }

    // Delimiter regex prioritizing whitespace-padded separators, en/em dashes, and 4-digit year spans
    let parts = [];
    if (/\s+(?:–|—|-|\bto\b|\buntil\b|\bthru\b|\bthrough\b)\s+/i.test(rawDateRange)) {
      parts = rawDateRange.split(/\s+(?:–|—|-|\bto\b|\buntil\b|\bthru\b|\bthrough\b)\s+/i);
    } else if (/[–—]/.test(rawDateRange)) {
      parts = rawDateRange.split(/\s*[–—]\s*/);
    } else if (/\b(?:to|until|thru|through)\b/i.test(rawDateRange)) {
      parts = rawDateRange.split(/\s*\b(?:to|until|thru|through)\b\s*/i);
    } else if (/\b(\d{4})\s*-\s*(\d{4})\b/.test(rawDateRange)) {
      const ym = rawDateRange.match(/\b(\d{4})\s*-\s*(\d{4})\b/);
      if (ym) parts = [ym[1], ym[2]];
    } else if (/\b(\d{1,2}[/.]\d{4})\s*-\s*(\d{1,2}[/.]\d{4})\b/.test(rawDateRange)) {
      const mm = rawDateRange.match(/\b(\d{1,2}[/.]\d{4})\s*-\s*(\d{1,2}[/.]\d{4})\b/);
      if (mm) parts = [mm[1], mm[2]];
    } else {
      parts = rawDateRange
        .split(/\s*-\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
    }

    parts = parts.map((p) => p.trim()).filter(Boolean);

    if (parts.length >= 2) {
      const startParsed = parseSingleDateToken(parts[0]);
      const endParsed = parseSingleDateToken(parts[1]);

      if (startParsed && endParsed) {
        const isCurrent = endParsed.isCurrent;
        const startYear = startParsed.year;
        const startMonth = startParsed.month;
        const endYear = isCurrent ? null : endParsed.year;
        let endMonth = isCurrent ? null : endParsed.month;

        // If end token was season/quarter and had endMonth info
        if (endParsed.seasonInfo) {
          endMonth = endParsed.seasonInfo.end;
        } else if (endParsed.quarterInfo) {
          endMonth = endParsed.quarterInfo.end;
        }

        const startDate = startYear
          ? startMonth
            ? `${startYear}-${pad2(startMonth)}`
            : `${startYear}`
          : null;

        const endDate = isCurrent
          ? null
          : endYear
            ? endMonth
              ? `${endYear}-${pad2(endMonth)}`
              : `${endYear}`
            : null;

        return {
          startDate,
          endDate,
          isCurrent,
          rawDateRange,
          startYear,
          startMonth,
          endYear,
          endMonth,
          isUncertain: false,
        };
      }
    }

    // Single date token or year range within single text (e.g. "Summer 2024", "2024", "June 2024")
    const single = parseSingleDateToken(rawDateRange);
    if (single) {
      const isCurrent = single.isCurrent;
      const startYear = single.year;
      const startMonth = single.month;
      const endYear = isCurrent ? null : single.year;
      let endMonth = isCurrent ? null : single.month;

      if (single.seasonInfo) {
        endMonth = single.seasonInfo.end;
      } else if (single.quarterInfo) {
        endMonth = single.quarterInfo.end;
      }

      const startDate = startYear
        ? startMonth
          ? `${startYear}-${pad2(startMonth)}`
          : `${startYear}`
        : null;

      const endDate = isCurrent
        ? null
        : endYear && endMonth && !single.isYearOnly
          ? `${endYear}-${pad2(endMonth)}`
          : null;

      return {
        startDate,
        endDate,
        isCurrent,
        rawDateRange,
        startYear,
        startMonth,
        endYear,
        endMonth,
        isUncertain: false,
      };
    }

    // Unparseable fallback
    return {
      startDate: null,
      endDate: null,
      isCurrent: /present|current|now|ongoing/i.test(rawDateRange),
      rawDateRange,
      startYear: null,
      startMonth: null,
      endYear: null,
      endMonth: null,
      isUncertain: true,
    };
  }
}
