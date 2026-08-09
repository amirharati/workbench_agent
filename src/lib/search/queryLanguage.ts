import type { SearchDocument, SearchIndex } from './types';
import { tokenize } from './tokenize';

export type SearchQueryAtom = {
  kind: 'term' | 'phrase';
  value: string;
};

export type SearchQueryClause = {
  /** Every atom in one clause is required. Clauses are joined by OR. */
  atoms: SearchQueryAtom[];
};

export interface ParsedSearchQuery {
  raw: string;
  clauses: SearchQueryClause[];
  excluded: SearchQueryAtom[];
  site?: string;
  /** Operator-free positive text used for lexical scoring and query embedding. */
  semanticText: string;
}

type ScannedToken = {
  value: string;
  quoted: boolean;
  prefix?: '+' | '-';
};

function scanQuery(raw: string): ScannedToken[] {
  const tokens: ScannedToken[] = [];
  let index = 0;

  while (index < raw.length) {
    while (index < raw.length && /[\s,]/u.test(raw[index])) index++;
    if (index >= raw.length) break;

    let prefix: '+' | '-' | undefined;
    if (raw[index] === '+' || raw[index] === '-') {
      prefix = raw[index] as '+' | '-';
      index++;
    }

    if (raw[index] === '"' || raw[index] === '“' || raw[index] === '”') {
      const openingQuote = raw[index];
      const closingQuote = openingQuote === '“' ? '”' : openingQuote;
      index++;
      const start = index;
      while (index < raw.length && raw[index] !== closingQuote) index++;
      const value = raw.slice(start, index).trim();
      if (index < raw.length && raw[index] === closingQuote) index++;
      if (value) tokens.push({ value, quoted: true, prefix });
      continue;
    }

    const start = index;
    while (index < raw.length && !/[\s,]/u.test(raw[index])) index++;
    const value = raw.slice(start, index).trim();
    if (value) tokens.push({ value, quoted: false, prefix });
  }

  return tokens;
}

function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeSite(value: string): string | undefined {
  const raw = value.trim().toLowerCase();
  if (!raw) return undefined;
  try {
    const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '') || undefined;
  } catch {
    return raw.replace(/^www\./, '').split('/')[0] || undefined;
  }
}

function atomsFromToken(token: ScannedToken): SearchQueryAtom[] {
  if (token.quoted) {
    const phrase = normalizePhrase(token.value);
    return phrase ? [{ kind: 'phrase', value: phrase }] : [];
  }
  return tokenize(token.value).map((value) => ({ kind: 'term' as const, value }));
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const clauses: SearchQueryClause[] = [{ atoms: [] }];
  const excluded: SearchQueryAtom[] = [];
  let site: string | undefined;

  for (const token of scanQuery(raw)) {
    const upper = token.value.toUpperCase();
    if (!token.quoted && !token.prefix && upper === 'OR') {
      if (clauses[clauses.length - 1].atoms.length > 0) clauses.push({ atoms: [] });
      continue;
    }
    if (!token.quoted && !token.prefix && upper === 'AND') continue;

    if (!token.quoted && !token.prefix && token.value.toLowerCase().startsWith('site:')) {
      site = normalizeSite(token.value.slice('site:'.length)) ?? site;
      continue;
    }

    const atoms = atomsFromToken(token);
    if (token.prefix === '-') excluded.push(...atoms);
    else clauses[clauses.length - 1].atoms.push(...atoms);
  }

  const populatedClauses = clauses.filter((clause) => clause.atoms.length > 0);
  const positiveAtoms = populatedClauses.flatMap((clause) => clause.atoms);
  const semanticText = positiveAtoms
    .map((atom) => atom.kind === 'phrase' ? atom.value : atom.value)
    .join(' ')
    .trim();

  return {
    raw: raw.trim(),
    clauses: populatedClauses,
    excluded,
    site,
    semanticText,
  };
}

function categoryText(doc: SearchDocument, index?: Pick<SearchIndex, 'categoryById'>): string[] {
  if (!index) return [];
  return doc.categoryIds.flatMap((categoryId) => {
    const category = index.categoryById.get(categoryId);
    return category ? [category.name, category.parentName ?? ''] : [];
  });
}

function documentFields(
  doc: SearchDocument,
  index?: Pick<SearchIndex, 'categoryById'>
): string[] {
  return [
    doc.title,
    doc.url,
    doc.domain,
    doc.notes,
    doc.summary,
    doc.sourceKind ?? '',
    ...doc.tags,
    ...doc.keyPoints,
    ...categoryText(doc, index),
  ].filter(Boolean);
}

function atomMatches(atom: SearchQueryAtom, fields: string[], tokens: Set<string>): boolean {
  if (atom.kind === 'term') return tokens.has(atom.value);
  return fields.some((field) => normalizePhrase(field).includes(atom.value));
}

export function matchesParsedSearchGuards(
  doc: SearchDocument,
  parsed: ParsedSearchQuery,
  index?: Pick<SearchIndex, 'categoryById'>
): boolean {
  const domain = doc.domain.toLowerCase().replace(/^www\./, '');
  if (parsed.site && domain !== parsed.site && !domain.endsWith(`.${parsed.site}`)) return false;

  const fields = documentFields(doc, index);
  const tokens = new Set(fields.flatMap((field) => tokenize(field, { dropStopWords: false })));
  return !parsed.excluded.some((atom) => atomMatches(atom, fields, tokens));
}

export function matchesParsedSearchQuery(
  doc: SearchDocument,
  parsed: ParsedSearchQuery,
  index?: Pick<SearchIndex, 'categoryById'>
): boolean {
  if (!matchesParsedSearchGuards(doc, parsed, index)) return false;
  if (parsed.clauses.length === 0) return true;

  const fields = documentFields(doc, index);
  const tokens = new Set(fields.flatMap((field) => tokenize(field, { dropStopWords: false })));
  return parsed.clauses.some((clause) =>
    clause.atoms.every((atom) => atomMatches(atom, fields, tokens))
  );
}

function formatAtom(atom: SearchQueryAtom): string {
  return atom.kind === 'phrase' ? `“${atom.value}”` : atom.value;
}

export function describeParsedSearchQuery(parsed: ParsedSearchQuery): string {
  const clauseLabels = parsed.clauses.map((clause) => clause.atoms.map(formatAtom).join(' + '));
  const parts: string[] = [];
  if (clauseLabels.length === 1) parts.push(`All: ${clauseLabels[0]}`);
  else if (clauseLabels.length > 1) parts.push(`Either: ${clauseLabels.map((label) => `(${label})`).join(' OR ')}`);
  if (parsed.excluded.length) parts.push(`Exclude: ${parsed.excluded.map(formatAtom).join(', ')}`);
  if (parsed.site) parts.push(`Site: ${parsed.site}`);
  return parts.join(' · ');
}
