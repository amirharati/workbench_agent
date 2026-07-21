import React, { useEffect, useState } from 'react';
import { DialogShell } from './DialogShell';

export interface TextPromptDialogProps {
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  placeholder?: string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

/** Shared single-value form for lightweight naming and renaming flows. */
export const TextPromptDialog: React.FC<TextPromptDialogProps> = ({
  title,
  description,
  label,
  initialValue = '',
  confirmLabel,
  placeholder,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialValue);
    setError(null);
  }, [initialValue]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(`${label} is required.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The change could not be saved.');
      setBusy(false);
    }
  };

  return (
    <DialogShell
      title={title}
      description={description}
      onClose={busy ? () => undefined : onCancel}
      maxWidth={440}
      footer={
        <>
          <button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button className="ui-button ui-button--primary" type="submit" form="ui-text-prompt-form" disabled={busy || !value.trim()}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </>
      }
    >
      <form id="ui-text-prompt-form" onSubmit={submit}>
        <label className="ui-form__group">
          <span className="ui-form__label">{label}</span>
          <input
            className="ui-field"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        {error ? <div className="ui-status" data-tone="error" role="alert">{error}</div> : null}
      </form>
    </DialogShell>
  );
};
