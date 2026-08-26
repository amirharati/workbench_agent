import type { CSSProperties } from 'react';

const CATEGORY_HUES = [212, 264, 322, 166, 24, 190, 46, 128] as const;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Gives every topical category family a stable hue across pages and reloads.
 * Parent context is preferred so siblings read as one family rather than a
 * collection of unrelated random colors.
 */
export function categoryColorStyle(input: {
  categoryId?: string;
  label?: string;
  parentLabel?: string;
}): CSSProperties {
  const key = input.parentLabel?.trim() || input.categoryId?.trim() || input.label?.trim() || 'category';
  const hue = CATEGORY_HUES[stableHash(key.toLocaleLowerCase()) % CATEGORY_HUES.length];
  return { '--category-hue': String(hue) } as CSSProperties;
}
