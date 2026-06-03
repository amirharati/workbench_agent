import React from 'react';
import type { Item } from '../../lib/db';
import { TrashTab } from './TrashTab';

interface TrashViewProps {
  onOpenItem?: (item: Item) => void;
}

/** Full-page trash bin — restore links or delete permanently (URL kept for import block). */
export const TrashView: React.FC<TrashViewProps> = ({ onOpenItem }) => {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.25rem 1.5rem',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <TrashTab onItemClick={onOpenItem} variant="page" />
    </div>
  );
};
