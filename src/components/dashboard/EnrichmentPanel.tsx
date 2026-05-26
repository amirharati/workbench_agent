import { useRef, useState } from 'react';
import { Sparkles, Eye, Tags } from 'lucide-react';
import { EnrichmentTestModal } from './EnrichmentTestModal';
import { EnrichmentReviewModal } from './EnrichmentReviewModal';

type Props = {
  /** Pre-check these when the test modal opens (e.g. current Bookmarks view) */
  preselectedIds?: string[];
  onComplete?: () => void;
};

/** Dev toolbar: enrich, browse results, queue/taxonomy — all on Bookmarks. */
export function EnrichmentPanel({ preselectedIds = [], onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [devTab, setDevTab] = useState<'results' | 'pipeline'>('results');
  const preselectedSnapshotRef = useRef<string[]>([]);

  const handleOpen = () => {
    preselectedSnapshotRef.current = [...preselectedIds];
    setOpen(true);
  };

  const openDev = (tab: 'results' | 'pipeline') => {
    setDevTab(tab);
    setDevOpen(true);
  };

  const btnStyle = {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    padding: '2px 10px',
    height: 24,
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => openDev('results')}
        style={btnStyle}
        title="Browse enrichment results (Items tab)"
      >
        <Eye size={12} /> Results
      </button>
      <button
        type="button"
        onClick={handleOpen}
        style={btnStyle}
        title="Open enrichment test picker"
      >
        <Sparkles size={12} /> Enrich
      </button>
      <button
        type="button"
        onClick={() => openDev('pipeline')}
        style={btnStyle}
        title="Classify queue, category taxonomy, pipeline controls"
      >
        <Tags size={12} /> Categories
      </button>

      <EnrichmentTestModal
        open={open}
        onClose={() => setOpen(false)}
        onComplete={onComplete}
        preselectedIds={preselectedSnapshotRef.current}
      />
      <EnrichmentReviewModal
        open={devOpen}
        onClose={() => setDevOpen(false)}
        initialTab={devTab}
      />
    </>
  );
}
