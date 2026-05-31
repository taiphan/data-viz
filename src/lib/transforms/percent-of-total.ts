// ============================================================
// PERCENT OF TOTAL — Transform Module
// ============================================================

/**
 * Computes percent-of-total for an array of numeric values.
 * Each value is expressed as a percentage of the sum of all values.
 *
 * - Uses absolute values for the total denominator to handle negatives.
 * - Returns 0% for all values when the total is zero.
 * - Percentages sum to 100 (±0.01 for floating point tolerance).
 */
export function computePercentOfTotal(values: number[]): number[] {
  if (values.length === 0) return [];

  const total = values.reduce((sum, v) => sum + Math.abs(v), 0);

  if (total === 0) {
    return values.map(() => 0);
  }

  return values.map((v) => (Math.abs(v) / total) * 100);
}

/**
 * Computes percent-of-total for rows, adding a percentage field.
 *
 * When groupField is provided, percentages are computed within each group
 * (each group sums to 100%). When groupField is null/undefined, percentages
 * are computed across all rows.
 *
 * Adds a `${valueField}_pct` field to each row with the percentage value.
 */
export function computePercentOfTotalByGroup(
  rows: Record<string, unknown>[],
  valueField: string,
  groupField?: string | null
): Record<string, unknown>[] {
  if (rows.length === 0) return [];

  const pctField = `${valueField}_pct`;

  if (!groupField) {
    // Compute across all rows
    const values = rows.map((row) => Number(row[valueField]) || 0);
    const percentages = computePercentOfTotal(values);

    return rows.map((row, i) => ({
      ...row,
      [pctField]: percentages[i],
    }));
  }

  // Group rows by the groupField value
  const groups = new Map<string, number[]>();
  const groupIndices = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const groupKey = String(row[groupField] ?? '');
    const value = Number(row[valueField]) || 0;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      groupIndices.set(groupKey, []);
    }
    groups.get(groupKey)!.push(value);
    groupIndices.get(groupKey)!.push(index);
  });

  // Compute percentages within each group
  const result = rows.map((row) => ({ ...row, [pctField]: 0 }));

  groups.forEach((values, groupKey) => {
    const percentages = computePercentOfTotal(values);
    const indices = groupIndices.get(groupKey)!;

    indices.forEach((rowIndex, i) => {
      result[rowIndex][pctField] = percentages[i];
    });
  });

  return result;
}
