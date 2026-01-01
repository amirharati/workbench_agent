/**
 * Application constants
 */

export const UI_CONSTANTS = {
  STATUS_TIMEOUT_MS: 2000,
  SIDE_PANEL_WIDTH_THRESHOLD: 500,
} as const;

export const DB_CONSTANTS = {
  NAME: 'personal-tools-db',
  VERSION: 3,
} as const;

export const DEFAULT_VALUES = {
  PROJECT_ID: 'project_all',
  PROJECT_NAME: 'All',
  UNSORTED_COLLECTION_NAME: 'Unsorted',
  COLLECTION_COLOR: '#3b82f6',
} as const;

export const COLORS = {
  PRIMARY: '#2563eb',
  PRIMARY_HOVER: '#1d4ed8',
  SUCCESS: '#22c55e',
  ERROR: '#ef4444',
  WARNING: '#f59e0b',
  GRAY_50: '#f9fafb',
  GRAY_100: '#f3f4f6',
  GRAY_200: '#e5e7eb',
  GRAY_300: '#d1d5db',
  GRAY_400: '#9ca3af',
  GRAY_500: '#6b7280',
  GRAY_600: '#4b5563',
  GRAY_700: '#374151',
  GRAY_800: '#1f2937',
  GRAY_900: '#111827',
} as const;

