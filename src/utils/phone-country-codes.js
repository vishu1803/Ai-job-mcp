/**
 * @file Reusable Country Calling Code Dataset & Phone Normalization Utilities.
 *
 * Implements canonical E.164 country calling code resolution, validation,
 * local number normalization, and backward-compatible phone parsing.
 */

import { ValidationError } from '../errors/index.js';

/**
 * Standard international country calling codes dataset (ISO 3166-1 alpha-2).
 * Sorted alphabetically by country name.
 *
 * @type {ReadonlyArray<{ name: string, code: string, dialCode: string, flag: string }>}
 */
export const COUNTRY_CALLING_CODES = Object.freeze([
  { name: 'Afghanistan', code: 'AF', dialCode: '+93', flag: '🇦🇫' },
  { name: 'Albania', code: 'AL', dialCode: '+355', flag: '🇦🇱' },
  { name: 'Algeria', code: 'DZ', dialCode: '+213', flag: '🇩🇿' },
  { name: 'Andorra', code: 'AD', dialCode: '+376', flag: '🇦🇩' },
  { name: 'Angola', code: 'AO', dialCode: '+244', flag: '🇦🇴' },
  { name: 'Argentina', code: 'AR', dialCode: '+54', flag: '🇦🇷' },
  { name: 'Armenia', code: 'AM', dialCode: '+374', flag: '🇦🇲' },
  { name: 'Australia', code: 'AU', dialCode: '+61', flag: '🇦🇺' },
  { name: 'Austria', code: 'AT', dialCode: '+43', flag: '🇦🇹' },
  { name: 'Azerbaijan', code: 'AZ', dialCode: '+994', flag: '🇦🇿' },
  { name: 'Bahamas', code: 'BS', dialCode: '+1242', flag: '🇧🇸' },
  { name: 'Bahrain', code: 'BH', dialCode: '+973', flag: '🇧🇭' },
  { name: 'Bangladesh', code: 'BD', dialCode: '+880', flag: '🇧🇩' },
  { name: 'Barbados', code: 'BB', dialCode: '+1246', flag: '🇧🇧' },
  { name: 'Belarus', code: 'BY', dialCode: '+375', flag: '🇧🇾' },
  { name: 'Belgium', code: 'BE', dialCode: '+32', flag: '🇧🇪' },
  { name: 'Belize', code: 'BZ', dialCode: '+501', flag: '🇧🇿' },
  { name: 'Benin', code: 'BJ', dialCode: '+229', flag: '🇧🇯' },
  { name: 'Bhutan', code: 'BT', dialCode: '+975', flag: '🇧🇹' },
  { name: 'Bolivia', code: 'BO', dialCode: '+591', flag: '🇧🇴' },
  { name: 'Bosnia and Herzegovina', code: 'BA', dialCode: '+387', flag: '🇧🇦' },
  { name: 'Botswana', code: 'BW', dialCode: '+267', flag: '🇧🇼' },
  { name: 'Brazil', code: 'BR', dialCode: '+55', flag: '🇧🇷' },
  { name: 'Bulgaria', code: 'BG', dialCode: '+359', flag: '🇧🇬' },
  { name: 'Cambodia', code: 'KH', dialCode: '+855', flag: '🇰🇭' },
  { name: 'Cameroon', code: 'CM', dialCode: '+237', flag: '🇨🇲' },
  { name: 'Canada', code: 'CA', dialCode: '+1', flag: '🇨🇦' },
  { name: 'Chile', code: 'CL', dialCode: '+56', flag: '🇨🇱' },
  { name: 'China', code: 'CN', dialCode: '+86', flag: '🇨🇳' },
  { name: 'Colombia', code: 'CO', dialCode: '+57', flag: '🇨🇴' },
  { name: 'Costa Rica', code: 'CR', dialCode: '+506', flag: '🇨🇷' },
  { name: 'Croatia', code: 'HR', dialCode: '+385', flag: '🇭🇷' },
  { name: 'Cyprus', code: 'CY', dialCode: '+357', flag: '🇨🇾' },
  { name: 'Czech Republic', code: 'CZ', dialCode: '+420', flag: '🇨🇿' },
  { name: 'Denmark', code: 'DK', dialCode: '+45', flag: '🇩🇰' },
  { name: 'Dominican Republic', code: 'DO', dialCode: '+1809', flag: '🇩🇴' },
  { name: 'Ecuador', code: 'EC', dialCode: '+593', flag: '🇪🇨' },
  { name: 'Egypt', code: 'EG', dialCode: '+20', flag: '🇪🇬' },
  { name: 'El Salvador', code: 'SV', dialCode: '+503', flag: '🇸🇻' },
  { name: 'Estonia', code: 'EE', dialCode: '+372', flag: '🇪🇪' },
  { name: 'Ethiopia', code: 'ET', dialCode: '+251', flag: '🇪🇹' },
  { name: 'Fiji', code: 'FJ', dialCode: '+679', flag: '🇫🇯' },
  { name: 'Finland', code: 'FI', dialCode: '+358', flag: '🇫🇮' },
  { name: 'France', code: 'FR', dialCode: '+33', flag: '🇫🇷' },
  { name: 'Georgia', code: 'GE', dialCode: '+995', flag: '🇬🇪' },
  { name: 'Germany', code: 'DE', dialCode: '+49', flag: '🇩🇪' },
  { name: 'Ghana', code: 'GH', dialCode: '+233', flag: '🇬🇭' },
  { name: 'Greece', code: 'GR', dialCode: '+30', flag: '🇬🇷' },
  { name: 'Guatemala', code: 'GT', dialCode: '+502', flag: '🇬🇹' },
  { name: 'Honduras', code: 'HN', dialCode: '+504', flag: '🇭🇳' },
  { name: 'Hong Kong', code: 'HK', dialCode: '+852', flag: '🇭🇰' },
  { name: 'Hungary', code: 'HU', dialCode: '+36', flag: '🇭🇺' },
  { name: 'Iceland', code: 'IS', dialCode: '+354', flag: '🇮🇸' },
  { name: 'India', code: 'IN', dialCode: '+91', flag: '🇮🇳' },
  { name: 'Indonesia', code: 'ID', dialCode: '+62', flag: '🇮🇩' },
  { name: 'Iran', code: 'IR', dialCode: '+98', flag: '🇮🇷' },
  { name: 'Iraq', code: 'IQ', dialCode: '+964', flag: '🇮🇶' },
  { name: 'Ireland', code: 'IE', dialCode: '+353', flag: '🇮🇪' },
  { name: 'Israel', code: 'IL', dialCode: '+972', flag: '🇮🇱' },
  { name: 'Italy', code: 'IT', dialCode: '+39', flag: '🇮🇹' },
  { name: 'Jamaica', code: 'JM', dialCode: '+1876', flag: '🇯🇲' },
  { name: 'Japan', code: 'JP', dialCode: '+81', flag: '🇯🇵' },
  { name: 'Jordan', code: 'JO', dialCode: '+962', flag: '🇯🇴' },
  { name: 'Kazakhstan', code: 'KZ', dialCode: '+7', flag: '🇰🇿' },
  { name: 'Kenya', code: 'KE', dialCode: '+254', flag: '🇰🇪' },
  { name: 'Kuwait', code: 'KW', dialCode: '+965', flag: '🇰🇼' },
  { name: 'Latvia', code: 'LV', dialCode: '+371', flag: '🇱🇻' },
  { name: 'Lebanon', code: 'LB', dialCode: '+961', flag: '🇱🇧' },
  { name: 'Lithuania', code: 'LT', dialCode: '+370', flag: '🇱🇹' },
  { name: 'Luxembourg', code: 'LU', dialCode: '+352', flag: '🇱🇺' },
  { name: 'Malaysia', code: 'MY', dialCode: '+60', flag: '🇲🇾' },
  { name: 'Maldives', code: 'MV', dialCode: '+960', flag: '🇲🇻' },
  { name: 'Malta', code: 'MT', dialCode: '+356', flag: '🇲🇹' },
  { name: 'Mauritius', code: 'MU', dialCode: '+230', flag: '🇲🇺' },
  { name: 'Mexico', code: 'MX', dialCode: '+52', flag: '🇲🇽' },
  { name: 'Morocco', code: 'MA', dialCode: '+212', flag: '🇲🇦' },
  { name: 'Nepal', code: 'NP', dialCode: '+977', flag: '🇳🇵' },
  { name: 'Netherlands', code: 'NL', dialCode: '+31', flag: '🇳🇱' },
  { name: 'New Zealand', code: 'NZ', dialCode: '+64', flag: '🇳🇿' },
  { name: 'Nigeria', code: 'NG', dialCode: '+234', flag: '🇳🇬' },
  { name: 'Norway', code: 'NO', dialCode: '+47', flag: '🇳🇴' },
  { name: 'Oman', code: 'OM', dialCode: '+968', flag: '🇴🇲' },
  { name: 'Pakistan', code: 'PK', dialCode: '+92', flag: '🇵🇰' },
  { name: 'Panama', code: 'PA', dialCode: '+507', flag: '🇵🇦' },
  { name: 'Paraguay', code: 'PY', dialCode: '+595', flag: '🇵🇾' },
  { name: 'Peru', code: 'PE', dialCode: '+51', flag: '🇵🇪' },
  { name: 'Philippines', code: 'PH', dialCode: '+63', flag: '🇵🇭' },
  { name: 'Poland', code: 'PL', dialCode: '+48', flag: '🇵🇱' },
  { name: 'Portugal', code: 'PT', dialCode: '+351', flag: '🇵🇹' },
  { name: 'Qatar', code: 'QA', dialCode: '+974', flag: '🇶🇦' },
  { name: 'Romania', code: 'RO', dialCode: '+40', flag: '🇷🇴' },
  { name: 'Russia', code: 'RU', dialCode: '+7', flag: '🇷🇺' },
  { name: 'Rwanda', code: 'RW', dialCode: '+250', flag: '🇷🇼' },
  { name: 'Saudi Arabia', code: 'SA', dialCode: '+966', flag: '🇸🇦' },
  { name: 'Serbia', code: 'RS', dialCode: '+381', flag: '🇷🇸' },
  { name: 'Singapore', code: 'SG', dialCode: '+65', flag: '🇸🇬' },
  { name: 'Slovakia', code: 'SK', dialCode: '+421', flag: '🇸🇰' },
  { name: 'Slovenia', code: 'SI', dialCode: '+386', flag: '🇸🇮' },
  { name: 'South Africa', code: 'ZA', dialCode: '+27', flag: '🇿🇦' },
  { name: 'South Korea', code: 'KR', dialCode: '+82', flag: '🇰🇷' },
  { name: 'Spain', code: 'ES', dialCode: '+34', flag: '🇪🇸' },
  { name: 'Sri Lanka', code: 'LK', dialCode: '+94', flag: '🇱🇰' },
  { name: 'Sweden', code: 'SE', dialCode: '+46', flag: '🇸🇪' },
  { name: 'Switzerland', code: 'CH', dialCode: '+41', flag: '🇨🇭' },
  { name: 'Taiwan', code: 'TW', dialCode: '+886', flag: '🇹🇼' },
  { name: 'Tanzania', code: 'TZ', dialCode: '+255', flag: '🇹🇿' },
  { name: 'Thailand', code: 'TH', dialCode: '+66', flag: '🇹🇭' },
  { name: 'Tunisia', code: 'TN', dialCode: '+216', flag: '🇹🇳' },
  { name: 'Turkey', code: 'TR', dialCode: '+90', flag: '🇹🇷' },
  { name: 'Uganda', code: 'UG', dialCode: '+256', flag: '🇺🇬' },
  { name: 'Ukraine', code: 'UA', dialCode: '+380', flag: '🇺🇦' },
  { name: 'United Arab Emirates', code: 'AE', dialCode: '+971', flag: '🇦🇪' },
  { name: 'United Kingdom', code: 'GB', dialCode: '+44', flag: '🇬🇧' },
  { name: 'United States', code: 'US', dialCode: '+1', flag: '🇺🇸' },
  { name: 'Uruguay', code: 'UY', dialCode: '+598', flag: '🇺🇾' },
  { name: 'Uzbekistan', code: 'UZ', dialCode: '+998', flag: '🇺🇿' },
  { name: 'Venezuela', code: 'VE', dialCode: '+58', flag: '🇻🇪' },
  { name: 'Vietnam', code: 'VN', dialCode: '+84', flag: '🇻🇳' },
  { name: 'Zambia', code: 'ZM', dialCode: '+260', flag: '🇿🇲' },
  { name: 'Zimbabwe', code: 'ZW', dialCode: '+263', flag: '🇿🇼' },
]);

/**
 * Set of canonical valid dial codes for O(1) membership checking.
 */
export const CALLING_CODES_SET = new Set(COUNTRY_CALLING_CODES.map((c) => c.dialCode));

/**
 * Sorted dial codes descending by length for prefix matching.
 */
const PREFIX_SORTED_DIAL_CODES = Array.from(CALLING_CODES_SET).sort(
  (a, b) => b.length - a.length
);

/**
 * Determines whether a given dial code is recognized in the catalog.
 *
 * @param {string} code
 * @returns {boolean}
 */
export function isValidCallingCode(code) {
  if (typeof code !== 'string') return false;
  const trimmed = code.trim();
  const canonical = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  return CALLING_CODES_SET.has(canonical);
}

/**
 * Normalizes a country calling code to canonical "+<digits>" format.
 *
 * @param {string|null|undefined} code
 * @returns {string|null}
 * @throws {ValidationError} If code is invalid
 */
export function normalizeCountryCode(code) {
  if (code == null) return null;
  const trimmed = String(code).trim();
  if (!trimmed) return null;

  const canonical = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  if (!/^\+\d{1,4}$/.test(canonical) || !CALLING_CODES_SET.has(canonical)) {
    throw new ValidationError(`Invalid country calling code: ${code}`);
  }
  return canonical;
}

/**
 * Normalizes a local phone number string, stripping formatting characters
 * (spaces, dashes, parens, dots, slashes) while preserving meaningful digits.
 *
 * @param {string|null|undefined} phoneNumber
 * @returns {string|null}
 * @throws {ValidationError} If phoneNumber contains invalid characters or bad length
 */
export function normalizePhoneNumber(phoneNumber) {
  if (phoneNumber == null) return null;
  const trimmed = String(phoneNumber).trim();
  if (!trimmed) return null;

  // Reject invalid characters (letters, special symbols other than common phone punctuation)
  if (/[a-zA-Z]/.test(trimmed) || /[^0-9\s\-\(\)\.\/\+]/.test(trimmed)) {
    throw new ValidationError(`Phone number contains invalid characters: ${phoneNumber}`);
  }

  // Strip non-digit characters
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) {
    return null;
  }

  // E.164 recommends max 15 digits total. Local numbers are typically 4 to 15 digits.
  if (digitsOnly.length < 4 || digitsOnly.length > 15) {
    throw new ValidationError(
      `Phone number must contain between 4 and 15 digits (received ${digitsOnly.length})`
    );
  }

  return digitsOnly;
}

/**
 * Parses an existing stored phone string into countryCode and phoneNumber components
 * without corrupting legacy data.
 *
 * - If prefixed with a recognized "+<digits>" calling code, extracts code and local number.
 * - If no country code can safely be determined, preserves the original value and returns
 *   countryCode: null, requiring the user to explicitly select the country code in the UI.
 *
 * @param {string|null|undefined} storedPhone
 * @returns {{ countryCode: string|null, phoneNumber: string|null, phone: string|null, isLegacyUnspecified: boolean }}
 */
export function parseStoredPhone(storedPhone) {
  if (storedPhone == null) {
    return { countryCode: null, phoneNumber: null, phone: null, isLegacyUnspecified: false };
  }
  const trimmed = String(storedPhone).trim();
  if (!trimmed) {
    return { countryCode: null, phoneNumber: null, phone: null, isLegacyUnspecified: false };
  }

  if (trimmed.startsWith('+')) {
    for (const dialCode of PREFIX_SORTED_DIAL_CODES) {
      if (trimmed.startsWith(dialCode)) {
        const remainder = trimmed.slice(dialCode.length).trim();
        const cleanDigits = remainder.replace(/\D/g, '');
        if (cleanDigits.length >= 4) {
          return {
            countryCode: dialCode,
            phoneNumber: cleanDigits,
            phone: `${dialCode} ${cleanDigits}`,
            isLegacyUnspecified: false,
          };
        }
      }
    }
  }

  // If no country code could be safely identified, preserve the original value
  const digitsOnly = trimmed.replace(/\D/g, '');
  return {
    countryCode: null,
    phoneNumber: digitsOnly || trimmed,
    phone: trimmed,
    isLegacyUnspecified: true,
  };
}

/**
 * Normalizes phone record updates at save time.
 * Enforces:
 * - canonical "+<digits>" country code
 * - digit-normalized local phone number
 * - composite canonical string "+<digits> <number>"
 * - safe handling of empty / clearing updates
 * - preservation of valid existing data when not updated
 *
 * @param {object} params
 * @param {string|null} [params.countryCode]
 * @param {string|null} [params.phoneNumber]
 * @param {string|null} [params.rawPhone]
 * @param {object} [params.existing]
 * @returns {{ countryCode: string|null, phoneNumber: string|null, phone: string|null }}
 */
export function normalizePhoneRecord({
  countryCode = undefined,
  phoneNumber = undefined,
  rawPhone = undefined,
  existing = {},
} = {}) {
  // Case A: Explicit countryCode and/or phoneNumber provided
  if (countryCode !== undefined || phoneNumber !== undefined) {
    const rawCC = countryCode != null ? String(countryCode).trim() : null;
    const rawPN = phoneNumber != null ? String(phoneNumber).trim() : null;

    // Clearing both
    if (!rawCC && !rawPN) {
      return { countryCode: null, phoneNumber: null, phone: null };
    }

    // Only phoneNumber provided without countryCode
    if (rawPN && !rawCC) {
      const normPN = normalizePhoneNumber(rawPN);
      if (existing.countryCode && isValidCallingCode(existing.countryCode)) {
        const normCC = normalizeCountryCode(existing.countryCode);
        return {
          countryCode: normCC,
          phoneNumber: normPN,
          phone: `${normCC} ${normPN}`,
        };
      }
      // Cannot safely invent a country code
      return {
        countryCode: null,
        phoneNumber: normPN,
        phone: normPN,
      };
    }

    // Only countryCode provided without phoneNumber
    if (rawCC && !rawPN) {
      const normCC = normalizeCountryCode(rawCC);
      return {
        countryCode: normCC,
        phoneNumber: null,
        phone: null,
      };
    }

    // Both provided
    const normCC = normalizeCountryCode(rawCC);
    const normPN = normalizePhoneNumber(rawPN);
    return {
      countryCode: normCC,
      phoneNumber: normPN,
      phone: `${normCC} ${normPN}`,
    };
  }

  // Case B: Legacy single-string rawPhone provided
  if (rawPhone !== undefined) {
    if (rawPhone == null || !String(rawPhone).trim()) {
      return { countryCode: null, phoneNumber: null, phone: null };
    }
    const parsed = parseStoredPhone(rawPhone);
    if (parsed.countryCode) {
      return {
        countryCode: parsed.countryCode,
        phoneNumber: parsed.phoneNumber,
        phone: parsed.phone,
      };
    }
    // Cannot safely determine country code from raw legacy number
    return {
      countryCode: existing.countryCode || null,
      phoneNumber: parsed.phoneNumber,
      phone: parsed.phone,
    };
  }

  // Fallback: preserve existing
  return {
    countryCode: existing.countryCode || null,
    phoneNumber: existing.phoneNumber || null,
    phone: existing.phone || null,
  };
}

/**
 * Formats a normalized phone representation for display / rendering.
 *
 * @param {string|null|undefined} countryCode
 * @param {string|null|undefined} phoneNumber
 * @param {string|null|undefined} fallbackPhone
 * @returns {string}
 */
export function formatPhoneDisplay(countryCode, phoneNumber, fallbackPhone = '') {
  if (countryCode && phoneNumber) {
    const cleanCC = countryCode.trim();
    const cleanPN = phoneNumber.trim();
    return `${cleanCC} ${cleanPN}`;
  }
  return fallbackPhone ? String(fallbackPhone).trim() : '';
}
