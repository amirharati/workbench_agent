import React from 'react';
import type { Item } from '../lib/db';

export interface DeleteConfirmResult {
  action: 'cancel' | 'remove-from-collection' | 'delete-everywhere';
}

interface DeleteConfirmDialogProps {
  item: Item;
  collectionId?: string;  // Current collection context
  collectionName?: string;
  onResult: (result: DeleteConfirmResult) => void;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  item,
  collectionId,
  collectionName,
  onResult,
}) => {
  const placementCount = item.placements 
    ? Object.keys(item.placements).length 
    : item.collectionIds?.length || 1;
  
  const isInMultipleCollections = placementCount > 1;
  const canRemoveFromCollection = collectionId && isInMultipleCollections;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--layer-modal)',
      }}
      onClick={() => onResult({ action: 'cancel' })}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          borderRadius: 8,
          padding: 20,
          maxWidth: 400,
          width: '90%',
          boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)' }}>
          Move "{item.title || 'Untitled'}" to trash?
        </h3>
        
        {isInMultipleCollections && (
          <div style={{ 
            fontSize: 'var(--text-sm)', 
            color: 'var(--text-muted)', 
            marginBottom: 16,
            padding: '8px 12px',
            background: 'var(--bg-glass)',
            borderRadius: 6,
            border: '1px solid var(--border)'
          }}>
            This bookmark exists in <strong>{placementCount} collections</strong>.
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {canRemoveFromCollection && (
            <button
              onClick={() => onResult({ action: 'remove-from-collection' })}
              style={{
                padding: '10px 16px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 500 }}>Remove from {collectionName || 'this collection'}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                Keep in other collections
              </div>
            </button>
          )}
          
          <button
            onClick={() => onResult({ action: 'delete-everywhere' })}
            style={{
              padding: '10px 16px',
              borderRadius: 6,
              border: '1px solid var(--danger)',
              background: canRemoveFromCollection ? 'transparent' : 'var(--danger)',
              color: canRemoveFromCollection ? 'var(--danger)' : 'var(--accent-text)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 500 }}>
              {isInMultipleCollections ? 'Move to trash (all collections)' : 'Move to trash'}
            </div>
            {isInMultipleCollections && (
              <div style={{ fontSize: 'var(--text-xs)', opacity: 0.8, marginTop: 2 }}>
                Soft-delete from all {placementCount} collections
              </div>
            )}
          </button>
          
          <button
            onClick={() => onResult({ action: 'cancel' })}
            style={{
              padding: '10px 16px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
