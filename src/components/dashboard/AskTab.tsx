import React, { useState } from 'react';
import type { Item } from '../../lib/db';
import type { AISettings } from '../../lib/ai/types';
import { buildBookmarkGroundingPrompt } from '../../lib/ai/bookmarkContext';

type AskContext = 'current-item' | 'current-collection' | 'current-search' | 'whole-library';

const CONTEXT_OPTIONS: { value: AskContext; label: string }[] = [
  { value: 'current-item',       label: 'Current item' },
  { value: 'current-collection', label: 'Current collection' },
  { value: 'current-search',     label: 'Current search results' },
  { value: 'whole-library',      label: 'Whole library' },
];

interface AskTabProps {
  activeItem: Item | null;
  aiSettings?: AISettings;
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
  searchContext?: {
    query: string;
    resultItemIds: string[];
    items: Item[];
  } | null;
  onTestAI?: (
    settings: AISettings,
    prompt: string
  ) => Promise<{ text: string; model: string; requestedModel?: string; modelMismatch?: boolean }>;
}

export const AskTab: React.FC<AskTabProps> = ({
  activeItem,
  aiSettings,
  scopeProjectId,
  scopeCollectionId,
  searchContext,
  onTestAI,
}) => {
  const [context, setContext] = useState<AskContext>(activeItem ? 'current-item' : 'whole-library');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const placeholderForContext: Record<AskContext, string> = {
    'current-item':       activeItem ? `Ask about "${activeItem.title || 'this item'}"...` : 'Select an item to ask about it...',
    'current-collection': 'Ask about the current collection...',
    'current-search':     'Ask about current search results...',
    'whole-library':      'Ask about your library...',
  };

  const handleAsk = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) { setError('Enter a prompt.'); return; }
    if (!onTestAI || !aiSettings) { setError('Configure AI in Settings first.'); return; }

    if (context === 'current-collection') {
      setError('This context is not fully wired yet. Try "Current item", "Current search results", or "Whole library".');
      return;
    }

    if (context === 'current-search') {
      if (!searchContext?.resultItemIds.length) {
        setError('No search results yet. Run a library search first.');
        return;
      }
    }

    setRunning(true);
    setError('');
    setAnswer('');
    try {
      let promptToSend: string;

      if (context === 'current-search' && searchContext) {
        const searchItems = searchContext.items.filter((i) =>
          searchContext.resultItemIds.includes(i.id)
        );
        const { prompt } = buildBookmarkGroundingPrompt(trimmed, searchItems, 20);
        promptToSend = `Library search query: "${searchContext.query}"\n\n${prompt}`;
      } else {
        const scopeSummary =
          scopeCollectionId !== 'all'
            ? `collection:${scopeCollectionId}`
            : scopeProjectId !== 'all'
              ? `project:${scopeProjectId}`
              : 'all';

        const contextPreamble =
          context === 'current-item' && activeItem
            ? `Item context: "${activeItem.title || 'Untitled'}"${activeItem.url ? ` (${activeItem.url})` : ''}${activeItem.notes ? `\nNotes: ${activeItem.notes}` : ''}\n\n`
            : `Context: scope=${scopeSummary}\n\n`;

        promptToSend = `${contextPreamble}User prompt:\n${trimmed}`;
      }

      const result = await onTestAI(aiSettings, promptToSend);
      setAnswer(result.text.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed.');
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 12px',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div className="ui-ask-tab__status" role="note">
        <strong>Not implemented</strong>
        <span>Ask is the next major feature planned for this panel. The controls below are an early prototype, not a finished workflow.</span>
      </div>

      {/* Context selector */}
      <select
        value={context}
        onChange={(e) => {
          setContext(e.target.value as AskContext);
          setAnswer('');
          setError('');
        }}
        style={{
          width: '100%',
          padding: '5px 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--input-bg)',
          color: 'var(--text)',
          fontSize: 'var(--text-xs)',
          cursor: 'pointer',
        }}
      >
        {CONTEXT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Prompt textarea */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholderForContext[context]}
        style={{
          width: '100%',
          minHeight: 72,
          border: '1px solid var(--border)',
          background: 'var(--input-bg)',
          color: 'var(--text)',
          borderRadius: 'var(--radius-sm)',
          padding: '7px 8px',
          fontSize: 'var(--text-sm)',
          resize: 'vertical',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.4,
        }}
      />

      {/* Ask button */}
      <button
        onClick={handleAsk}
        disabled={running}
        style={{
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: running ? 'var(--accent-weak)' : 'var(--accent)',
          color: '#fff',
          cursor: running ? 'progress' : 'pointer',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
        }}
      >
        {running ? 'Asking…' : 'Ask'}
        {!running && (
          <span style={{ opacity: 0.6, marginLeft: 6, fontWeight: 400, fontSize: '0.9em' }}>
            ⌘↵
          </span>
        )}
      </button>

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
          {error}
        </div>
      )}

      {/* Answer */}
      <div
        className="scrollbar"
        style={{
          flex: 1,
          minHeight: 60,
          overflowY: 'auto',
          fontSize: 'var(--text-sm)',
          color: answer ? 'var(--text)' : 'var(--text-faint)',
          whiteSpace: 'pre-wrap',
          padding: 8,
          background: 'var(--bg)',
          borderRadius: 'var(--radius-sm)',
          lineHeight: 1.5,
        }}
      >
        {answer || 'Output appears here'}
      </div>
    </div>
  );
};
