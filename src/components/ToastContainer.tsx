import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { registerUserNotify } from '../lib/userNotify';
import { Toast, ToastData, ToastType } from './Toast';

interface AddToastOptions {
  type: ToastType;
  message: string;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastContextValue {
  addToast: (opts: AddToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export const useToast = () => useContext(ToastContext);

interface ToastProviderProps {
  children: React.ReactNode;
}

const MAX_TOASTS = 5;

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((opts: AddToastOptions) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => {
      const next = [...prev, { id, ...opts }];
      return next.slice(-MAX_TOASTS);
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    registerUserNotify((opts) => addToast(opts));
    return () => registerUserNotify(null);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(var(--browser-footer-safe-clearance) + 16px)',
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
