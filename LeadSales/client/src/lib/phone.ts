import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

const DEFAULT_COUNTRY: CountryCode = "PK";

export function formatPhoneInput(
  value: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string {
  const sanitized = value.replace(/[^\d+]/g, "");
  if (!sanitized) return "";

  const startsWithPlus = sanitized.startsWith("+");
  const formatter = new AsYouType(startsWithPlus ? undefined : defaultCountry);
  return formatter.input(sanitized);
}

export function normalizePhoneForSave(
  value: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return null;
  }

  return parsed.number;
}

export function isPhoneValid(
  value: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): boolean {
  if (!value || !String(value).trim()) return true;
  return normalizePhoneForSave(value, defaultCountry) !== null;
}
