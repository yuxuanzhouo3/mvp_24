function isValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function toIsoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function parseDatePattern(
  yearRaw: string,
  monthRaw: string,
  dayRaw: string,
  shortYear = false
) {
  const year = shortYear ? 2000 + Number.parseInt(yearRaw, 10) : Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);

  if (!isValidDateParts(year, month, day)) return null;
  return toIsoDate(year, month, day);
}

export function normalizeReleaseDate(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  const explicitDate =
    raw.match(/\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/) ||
    raw.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (explicitDate) {
    return parseDatePattern(explicitDate[1], explicitDate[2], explicitDate[3]);
  }

  const shortDate = raw.match(/(?:^|[^0-9])(\d{2})(\d{2})(\d{2})(?:$|[^0-9])/);
  if (shortDate) {
    return parseDatePattern(shortDate[1], shortDate[2], shortDate[3], true);
  }

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export interface ResolveModelReleaseDateInput {
  releaseDate?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  modelKey?: unknown;
  versionTag?: unknown;
  releaseTag?: unknown;
  collectionTag?: unknown;
  metadata?: Record<string, unknown> | null;
}

export function resolveModelReleaseDate(
  input: ResolveModelReleaseDateInput
): string | null {
  const metadata =
    input.metadata && typeof input.metadata === "object" ? input.metadata : null;

  const candidates = [
    input.releaseDate,
    metadata?.releaseDate,
    input.createdAt,
    metadata?.createdAt,
    metadata?.sourceCreatedAt,
    input.updatedAt,
    metadata?.updatedAt,
    metadata?.sourceUpdatedAt,
    input.versionTag,
    metadata?.versionTag,
    input.releaseTag,
    metadata?.releaseTag,
    input.collectionTag,
    metadata?.collectionTag,
    input.modelKey,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeReleaseDate(candidate);
    if (normalized) return normalized;
  }

  return null;
}
