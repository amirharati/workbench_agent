import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Item } from '../../lib/db';
import {
  buildAllDataModelFields,
  dataModelLabelColor,
  summarizeDataModel,
  type DataModelRow,
} from '../../lib/enrichment/fieldInventory';
import type { ItemEnrichment } from '../../lib/enrichment';

type Props = {
  item: Item;
  enrichment?: ItemEnrichment | null;
};

function ComparePanel({ compare }: { compare: NonNullable<DataModelRow['compare']> }) {
  return (
    <div
      className="er-compare-box"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        marginTop: 6,
        padding: 8,
        borderRadius: 6,
      }}
    >
      <div>
        <div className="er-muted" style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
          On bookmark
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 120,
            overflow: 'auto',
            fontStyle: compare.current ? 'normal' : 'italic',
            color: compare.current ? 'var(--text)' : 'var(--text-faint)',
          }}
        >
          {compare.current ?? '(empty)'}
        </div>
      </div>
      <div>
        <div className="er-fetch" style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
          From fetch
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 120,
            overflow: 'auto',
            fontStyle: compare.retrieved ? 'normal' : 'italic',
            color: compare.retrieved ? 'var(--text)' : 'var(--text-faint)',
          }}
        >
          {compare.retrieved ?? '(empty)'}
        </div>
      </div>
    </div>
  );
}

function DataRow({ row }: { row: DataModelRow }) {
  const [open, setOpen] = useState(false);
  const hasCompare = !!row.compare;

  return (
    <div
      className="er-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '72px minmax(90px, 120px) 52px 1fr',
        gap: 8,
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'start',
        fontSize: 'var(--text-xs)',
        color: 'var(--text)',
      }}
    >
      {hasCompare ? (
        <button
          type="button"
          className="er-btn"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: '2px 4px',
            fontSize: 9,
            fontWeight: 600,
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          vs
        </button>
      ) : (
        <span />
      )}
      <span style={{ fontWeight: 600, color: dataModelLabelColor(row), wordBreak: 'break-word' }}>
        {row.label}
        {row.fromFetch && (
          <span className="er-fetch" style={{ display: 'block', fontSize: 9, fontWeight: 500 }}>
            fetch
          </span>
        )}
        {row.empty && !row.fromFetch && (
          <span className="er-faint" style={{ display: 'block', fontSize: 9, fontWeight: 500 }}>
            empty
          </span>
        )}
      </span>
      <span className="er-muted" style={{ fontSize: 10 }}>
        {row.store}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: open ? undefined : 72,
            overflow: open ? 'visible' : 'auto',
            color: row.empty ? 'var(--text-faint)' : 'var(--text)',
            fontStyle: row.empty ? 'italic' : 'normal',
          }}
        >
          {row.empty ? '(empty)' : row.value}
        </div>
        {open && row.compare && <ComparePanel compare={row.compare} />}
      </div>
    </div>
  );
}

export function ItemFieldInventory({ item, enrichment }: Props) {
  const rows = useMemo(() => buildAllDataModelFields(item, enrichment), [item, enrichment]);
  const stats = useMemo(() => summarizeDataModel(rows), [rows]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, DataModelRow[]>();
    for (const r of rows) {
      if (!map.has(r.group)) {
        map.set(r.group, []);
        order.push(r.group);
      }
      map.get(r.group)!.push(r);
    }
    return order.map((name) => ({ name, rows: map.get(name)! }));
  }, [rows]);

  return (
    <section style={{ marginBottom: 16, color: 'var(--text)' }}>
      <h3
        className="er-muted"
        style={{
          margin: '0 0 4px',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Full data model
      </h3>
      <p className="er-muted" style={{ margin: '0 0 8px', fontSize: 10, lineHeight: 1.45 }}>
        All bookmark, collection, enrichment, and disk fields.{' '}
        <strong>Collections</strong> = one row per collection (not duplicate empty notes/tags rows).{' '}
        <span className="er-fetch">Red</span> = filled from fetch ·{' '}
        <span className="er-faint">Gray</span> = empty · {stats.filled} filled · {stats.empty} empty
        {stats.fromFetch > 0 && <> · {stats.fromFetch} from fetch</>}. <strong>vs</strong> compares
        bookmark vs fetch.
      </p>

      <div className="er-panel" style={{ borderRadius: 6, overflow: 'hidden' }}>
        <div
          className="er-table-header"
          style={{
            display: 'grid',
            gridTemplateColumns: '72px minmax(90px, 120px) 52px 1fr',
            gap: 8,
            padding: '6px 10px',
            fontWeight: 600,
            fontSize: 10,
          }}
        >
          <span />
          <span>Field</span>
          <span>Store</span>
          <span>Value</span>
        </div>

        {groups.map(({ name, rows: groupRows }) => (
          <div key={name}>
            <div
              className="er-group-header"
              style={{ padding: '5px 10px', fontWeight: 600, fontSize: 10 }}
            >
              {name}
              <span className="er-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                {groupRows.filter((r) => !r.empty).length}/{groupRows.length} filled
              </span>
            </div>
            {groupRows.map((r) => (
              <DataRow key={r.id} row={r} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
