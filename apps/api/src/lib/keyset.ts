// Composite keyset (seek) pagination helpers — one place for the logic so list routes
// page deterministically. Ordering must be a TOTAL order: sort field + id as tiebreaker.
// The cursor encodes the last row's { sort value, id }, so page N+1 starts exactly after
// the last row of page N — no dropped or duplicated rows on ties.

type SortValue = string | number | null;

export interface Keyset {
  v: SortValue;
  id: string;
}

/** base64url-encode the last row's sort value + id into an opaque cursor. */
export function encodeCursor(sortValue: string | number | Date | null, id: string): string {
  const v: SortValue = sortValue instanceof Date ? sortValue.toISOString() : sortValue;
  return Buffer.from(JSON.stringify({ v, id })).toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): Keyset | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Partial<Keyset>;
    if (typeof parsed.id !== 'string') return null;
    const v = parsed.v;
    if (v !== null && typeof v !== 'string' && typeof v !== 'number') return null;
    return { v, id: parsed.id };
  } catch {
    return null;
  }
}

/** The total-order orderBy: sort field then id, both in the same direction. */
export function keysetOrderBy(sortField: string, order: 'asc' | 'desc') {
  return [{ [sortField]: order }, { id: order }];
}

/**
 * A Prisma where-fragment for "rows after the cursor". Returns `undefined` when there's
 * no cursor. The caller must AND it into the where (e.g. `...(c && { AND: [c] })`) so it
 * never clobbers an existing top-level OR (search filters).
 */
export function keysetCondition(
  sortField: string,
  order: 'asc' | 'desc',
  cursor: Keyset | null,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  const op = order === 'desc' ? 'lt' : 'gt';
  if (cursor.v === null) {
    // The sort value at the cursor is null (nullable column) — seek within the null
    // group by id only; crossing into the non-null group is left to the next page's null cursor.
    return { [sortField]: null, id: { [op]: cursor.id } };
  }
  return {
    OR: [
      { [sortField]: { [op]: cursor.v } },
      { [sortField]: cursor.v, id: { [op]: cursor.id } },
    ],
  };
}
