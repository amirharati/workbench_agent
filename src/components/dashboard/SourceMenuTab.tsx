import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SourceMenuOption {
  value: string;
  label: string;
}

interface SourceMenuTabProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  selectedValue: string;
  options: readonly SourceMenuOption[];
  onSelect: (value: string) => void;
  /** Opens the selected source. The chevron alone opens the chooser. */
  onActivate?: () => void;
}

export const SourceMenuTab: React.FC<SourceMenuTabProps> = ({
  label,
  icon,
  active,
  selectedValue,
  options,
  onSelect,
  onActivate,
}) => {
  const [open, setOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  const selectedOption = options.find((option) => option.value === selectedValue) ?? options[0];

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect && typeof window !== 'undefined') {
      const width = Math.min(Math.max(rect.width, 220), Math.max(220, window.innerWidth - 16));
      setMenuPosition({
        top: rect.bottom + 5,
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
        width,
      });
    }
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);

  const menu = open && menuPosition && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="ui-source-menu-tab__menu scrollbar"
          role="listbox"
          aria-label={`${label} choices`}
          style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
        >
          {options.map((option) => {
            const selected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <Check size={13} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={rootRef} className="ui-source-menu-tab" data-active={active ? 'true' : 'false'} data-menu-open={open ? 'true' : 'false'}>
      <button
        className="ui-source-menu-tab__selection"
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={`${label} view: ${selectedOption?.label ?? 'Choose'}`}
        onClick={onActivate ?? (() => onSelect(selectedValue))}
      >
        {icon}
        <span className="ui-source-menu-tab__kind">{label}</span>
        <strong>{selectedOption?.label ?? 'Choose'}</strong>
      </button>
      <button
        className="ui-source-menu-tab__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Choose ${label}`}
        title={`Choose ${label}`}
        onClick={toggleMenu}
      >
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
};
