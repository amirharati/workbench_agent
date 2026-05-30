import type { ToastType } from '../components/Toast';

export type UserNotifyOptions = {
  type: ToastType;
  message: string;
};

type Listener = (opts: UserNotifyOptions) => void;

let listener: Listener | null = null;

/** Registered by ToastProvider when the dashboard mounts. */
export function registerUserNotify(fn: Listener | null): void {
  listener = fn;
}

/** Fire-and-forget toast when a provider is mounted (e.g. backup/import errors). */
export function notifyUser(opts: UserNotifyOptions): void {
  listener?.(opts);
}
