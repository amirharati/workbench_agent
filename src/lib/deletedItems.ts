/**
 * Permanent-delete tombstones for folder ↔ browser merge.
 * Soft-trash (deleted_at on items) does NOT write here.
 */
import { nowMs } from './time/clock';

export type DeletedItemEntry = {
  id: string;
  purgedAt: number;
  reason?: string | null;
};

export function buildDeletedItemEntry(
  id: string,
  reason?: string | null,
  purgedAt: number = nowMs()
): DeletedItemEntry {
  return {
    id,
    purgedAt,
    reason: reason ?? null,
  };
}
