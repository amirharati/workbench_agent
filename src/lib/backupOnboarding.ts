/**
 * Backup folder onboarding flags (chrome.storage.local).
 * Fresh installs start as `pending`. A backup folder is mandatory — no skip path.
 */

export type BackupFolderOnboardingState = 'pending' | 'done';

const STORAGE_KEY = 'backupFolderOnboarding';
const FORCE_OPEN_KEY = 'backupFolderOnboardingForceOpen';

export async function getBackupFolderOnboarding(): Promise<BackupFolderOnboardingState> {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  const v = r[STORAGE_KEY] as BackupFolderOnboardingState | 'skipped' | undefined;
  if (v === 'done') return 'done';
  return 'pending';
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

/** Whether to block the app until the user picks a backup folder. */
export async function shouldShowBackupOnboarding(): Promise<boolean> {
  const forced = await consumeBackupOnboardingOpenRequest();
  if (forced) return true;

  const { hasConfiguredBackupFolder, wasBackupFolderLinked } = await import('./backupFolder');
  // Linked (handle or sticky chrome.storage/meta) — never treat permission pause as “not set up”.
  if (await hasConfiguredBackupFolder()) return false;
  if (await wasBackupFolderLinked()) return true; // recover: must re-pick

  const state = await getBackupFolderOnboarding();
  return state !== 'done';
}
