type SupabaseResult<T> = {
  data?: T | null;
  error?: any;
};

export function toCompatError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : String(error));
}

export function extractMissingColumnName(
  error: unknown,
  tableName?: string
): string | null {
  const message = String((error as any)?.message || "");
  if (!message) {
    return null;
  }

  const normalizedTableName = tableName?.toLowerCase();
  const patterns = [
    /column\s+(?:public\.)?([a-z0-9_]+)\.([a-z0-9_]+)\s+does not exist/i,
    /could not find the ['"]([a-z0-9_]+)['"] column of ['"]([a-z0-9_]+)['"]/i,
    /column ['"]?([a-z0-9_]+)['"]?\s+of relation ['"]?([a-z0-9_]+)['"]?\s+does not exist/i,
    /column ['"]?([a-z0-9_]+)['"]?\s+does not exist/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) {
      continue;
    }

    if (match.length >= 3) {
      const [first, second] = [match[1], match[2]];
      if (!normalizedTableName) {
        return pattern === patterns[0] ? second : first;
      }

      const tableCandidate =
        pattern === patterns[0] ? first.toLowerCase() : second.toLowerCase();
      const columnCandidate = pattern === patterns[0] ? second : first;
      if (tableCandidate === normalizedTableName) {
        return columnCandidate;
      }
      continue;
    }

    if (match[1]) {
      return match[1];
    }
  }

  return null;
}

export function isMissingColumnError(
  error: unknown,
  column?: string,
  tableName?: string
): boolean {
  const code = String((error as any)?.code || "");
  if (code !== "42703" && code !== "PGRST204") {
    return false;
  }

  if (!column) {
    return extractMissingColumnName(error, tableName) !== null;
  }

  const missingColumn = extractMissingColumnName(error, tableName);
  return missingColumn?.toLowerCase() === column.toLowerCase();
}

export async function executeWithOptionalColumns<
  TPayload extends Record<string, any>,
  TResult,
>({
  payload,
  optionalColumns,
  tableName,
  execute,
}: {
  payload: TPayload;
  optionalColumns: Iterable<string>;
  tableName: string;
  execute: (payload: Partial<TPayload>) => Promise<SupabaseResult<TResult>>;
}): Promise<{
  data?: TResult | null;
  error?: any;
  payload: Partial<TPayload>;
  droppedColumns: string[];
}> {
  const optionalColumnSet = new Set(
    Array.from(optionalColumns, (column) => column.toLowerCase())
  );
  const currentPayload: Partial<TPayload> = { ...payload };
  const droppedColumns: string[] = [];

  while (true) {
    const result = await execute(currentPayload);
    if (!result.error) {
      return { ...result, payload: currentPayload, droppedColumns };
    }

    const missingColumn = extractMissingColumnName(result.error, tableName);
    if (!missingColumn) {
      return { ...result, payload: currentPayload, droppedColumns };
    }

    const normalizedColumn = missingColumn.toLowerCase();
    if (
      !optionalColumnSet.has(normalizedColumn) ||
      !(missingColumn in currentPayload) ||
      droppedColumns.includes(missingColumn)
    ) {
      return { ...result, payload: currentPayload, droppedColumns };
    }

    delete currentPayload[missingColumn as keyof typeof currentPayload];
    droppedColumns.push(missingColumn);
  }
}

export async function executeWithSelectFallback<TResult>({
  selectClauses,
  tableName,
  execute,
}: {
  selectClauses: string[];
  tableName: string;
  execute: (selectClause: string) => Promise<SupabaseResult<TResult>>;
}): Promise<{
  data?: TResult | null;
  error?: any;
  selectClause: string | null;
}> {
  let lastResult: SupabaseResult<TResult> = {};
  for (const selectClause of selectClauses) {
    const result = await execute(selectClause);
    if (!result.error || !isMissingColumnError(result.error, undefined, tableName)) {
      return { ...result, selectClause };
    }
    lastResult = result;
  }

  return {
    ...lastResult,
    selectClause: selectClauses.length > 0 ? selectClauses[selectClauses.length - 1] : null,
  };
}
