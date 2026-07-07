// Runtime shape validation at the row-mapper boundary. Supabase rows are
// untyped until src/types/database.ts is regenerated (#162); blind `as`
// casts let renamed columns flow through as undefined (PR #161 D1).
export function asNumber(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`malformed_row:${key}`);
  }
  return v;
}

export function asString(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`malformed_row:${key}`);
  }
  return v;
}
