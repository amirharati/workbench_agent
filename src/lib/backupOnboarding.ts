/**
 * Backup folder onboarding flags (chrome.storage.local).
 * Fresh installs start as `pending`.
 * We intentionally force setup for safety: any non-`done` state is treated as pending.
 */
import { hasWritableBackupFolder } from './backupFolder';

export type BackupFolderOnboardingState = 'pending' | 'done' | 'skipped';

const STORAGE_KEY = 'backupFolderOnboarding';
const FORCE_OPEN_KEY = 'backupFolderOnboardingForceOpen';

export async function getBackupFolderOnboarding(): Promise<BackupFolderOnboardingState> {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  const v = r[STORAGE_KEY] as BackupFolderOnboardingState | undefined;
  return v ?? 'pending';
}

export async function setBackupFolderOnboarding(state: BackupFolderOnboardingState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function requestBackupOnboardingOpen(): Promise<void> {
  await chrome.storage.local.set({ [FORCE_OPEN_KEY]: true });
}

export async function consumeBackupOnboardingOpenRequest(): Promise<boolean> {
  const r = await chrome.storage.local.get(FORCE_OPEN_KEY);
  const shouldForce = r[FORCE_OPEN_KEY] === true;
  if (shouldForce) {
    await chrome.storage.local.remove(FORCE_OPEN_KEY);
  }
  return shouldForce;
}

/** Whether to show the onboarding modal (blocking until pick or skip). */
export async function shouldShowBackupOnboarding(): Promise<boolean> {
  const forced = await consumeBackupOnboardingOpenRequest();
  if (forced) return true;

  const state = await getBackupFolderOnboarding();
  if (state !== 'done') return true;

  const ok = await hasWritableBackupFolder();
  return !ok;
}
