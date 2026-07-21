export function loadPageUiState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

export function savePageUiState<T>(key: string, state: T): void {
  try {
    const serialized = JSON.stringify(state);
    if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
  } catch {
    // Page state is a convenience; quota/security failures must not block use.
  }
}

export const LIBRARY_PAGE_UI_KEY = 'workbench:library-page-state:v1';
export const HOME_PAGE_UI_KEY = 'workbench:home-page-state:v1';

export function libraryPageUiKey(
  view: 'library' | 'notes',
  projectId: string,
  collectionId: string
): string {
  return `${LIBRARY_PAGE_UI_KEY}:${view}:${projectId}:${collectionId}`;
}

export function homePageUiKey(projectId: string, collectionId: string): string {
  return `${HOME_PAGE_UI_KEY}:${projectId}:${collectionId}`;
}

export function projectPageUiKey(projectId: string, collectionId: string): string {
  return `workbench:project-page-state:v1:${projectId}:${collectionId}`;
}
