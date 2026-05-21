import { useRef, useState } from 'react';
import { Sparkles, Eye } from 'lucide-react';
import { EnrichmentTestModal } from './EnrichmentTestModal';
import { EnrichmentReviewModal } from './EnrichmentReviewModal';

type Props = {
  /** Pre-check these when the test modal opens (e.g. current Bookmarks view) */
  preselectedIds?: string[];
  onComplete?: () => void;
};

/** Opens the full-screen enrichment test picker (temporary testing UI). */
export function EnrichmentPanel({ preselectedIds = [], onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const preselectedSnapshotRef = useRef<string[]>([]);

  const handleOpen = () => {
    preselectedSnapshotRef.current = [...preselectedIds];
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setReviewOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
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
        }}
        title="Browse enrichment results"
      >
        <Eye size={12} /> Results
      </button>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
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
        }}
        title="Open enrichment test picker"
      >
        <Sparkles size={12} /> Enrich
      </button>

      <EnrichmentTestModal
        open={open}
        onClose={() => setOpen(false)}
        onComplete={onComplete}
        preselectedIds={preselectedSnapshotRef.current}
      />
      <EnrichmentReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </>
  );
}
