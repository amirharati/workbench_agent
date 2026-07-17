import React from 'react';
import type { Item } from '../../lib/db';
import { getBookmarkOpenUrl } from '../../lib/itemQuickAccess';

type UrlItem = Pick<Item, 'url' | 'urlRaw'>;

/** Open URL in a new browser tab (Chrome extension or fallback). */
export async function openUrlInBrowser(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;
  if (!/^https?:\/\//i.test(trimmed) && !/^file:\/\//i.test(trimmed)) return;
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      await chrome.tabs.create({ url: trimmed, active: true });
      return;
    }
  } catch {
    /* fallback */
  }
  window.open(trimmed, '_blank', 'noopener,noreferrer');
}

/** Open bookmark URL in a new browser tab (Chrome extension or fallback). */
export async function openBookmarkInBrowser(item: UrlItem): Promise<void> {
  const url = getBookmarkOpenUrl(item);
  if (!url) return;
  await openUrlInBrowser(url);
}

const defaultStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-faint)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'inline-block',
  maxWidth: '100%',
  marginTop: 2,
  textDecoration: 'none',
  cursor: 'pointer',
};

type ExtensionPageUrlLinkProps = {
  url: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
  /** @default true */
  stopPropagation?: boolean;
  onBeforeOpen?: () => void;
  onMouseEnter?: React.MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLSpanElement>;
};

/**
 * Clickable URL on extension pages (side panel / new-tab dashboard).
 * No href="https://…" — avoids Chrome prefetch/prerender under extension CSP
 * (blocked-script + "preloaded but not used" console spam on index.html).
 */
export function ExtensionPageUrlLink({
  url,
  children,
  style,
  className,
  title,
  stopPropagation = true,
  onBeforeOpen,
  onMouseEnter,
  onMouseLeave,
}: ExtensionPageUrlLinkProps) {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const open = () => {
    onBeforeOpen?.();
    void openUrlInBrowser(trimmed);
  };

  const wrapEvent = (e: React.SyntheticEvent, fn: () => void) => {
    if (stopPropagation) e.stopPropagation();
    fn();
  };

  return (
    <span
      role="link"
      tabIndex={0}
      title={title ?? trimmed}
      className={className}
      aria-label={typeof children === 'string' ? undefined : trimmed}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          wrapEvent(e, open);
          return;
        }
        wrapEvent(e, open);
      }}
      onDoubleClick={(e) => {
        if (stopPropagation) e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          wrapEvent(e, open);
        }
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          wrapEvent(e, open);
        }
      }}
      style={{ cursor: 'pointer', width: 'fit-content', maxWidth: '100%', ...style }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children ?? trimmed}
    </span>
  );
}

export function BookmarkUrlLink({
  item,
  style,
  className,
}: {
  item: UrlItem;
  style?: React.CSSProperties;
  className?: string;
}) {
  const url = getBookmarkOpenUrl(item);
  if (!url) return null;

  return (
    <ExtensionPageUrlLink
      url={url}
      className={className}
      style={{ ...defaultStyle, ...style }}
      onMouseEnter={(e) => {
        e.currentTarget.style.textDecoration = 'underline';
        e.currentTarget.style.color = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.textDecoration = 'none';
        e.currentTarget.style.color = (style?.color as string) ?? 'var(--text-faint)';
      }}
    />
  );
}
