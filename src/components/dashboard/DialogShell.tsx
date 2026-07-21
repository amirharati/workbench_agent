import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface DialogShellProps {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number | string;
  maxHeight?: number | string;
  raised?: boolean;
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
}

/** Shared modal frame with Escape handling, focus containment, and focus restoration. */
export const DialogShell: React.FC<DialogShellProps> = ({
  title,
  description,
  onClose,
  children,
  footer,
  maxWidth = 480,
  maxHeight = 'min(88vh, 720px)',
  raised = false,
  bodyClassName,
  bodyStyle,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  );

  useEffect(() => {
    const previousFocus = previousFocusRef.current;
    const panel = panelRef.current;
    const initial = panel?.querySelector<HTMLElement>('[autofocus], [data-dialog-initial-focus]')
      ?? panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    const frame = window.requestAnimationFrame(() => initial?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
        .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="ui-dialog-backdrop"
      role="presentation"
      data-layer={raised ? 'raised' : 'default'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        style={{ maxWidth, maxHeight }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ui-dialog__header">
          <div className="ui-dialog__heading">
            <h2 className="ui-dialog__title" id={titleId}>{title}</h2>
            {description ? <div className="ui-dialog__description" id={descriptionId}>{description}</div> : null}
          </div>
          <button className="ui-button ui-button--icon ui-dialog__close" type="button" onClick={onClose} title="Close" aria-label={`Close ${title}`}>
            <X size={15} />
          </button>
        </header>
        <div className={`ui-dialog__body scrollbar${bodyClassName ? ` ${bodyClassName}` : ''}`} style={bodyStyle}>
          {children}
        </div>
        {footer ? <footer className="ui-dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
};
