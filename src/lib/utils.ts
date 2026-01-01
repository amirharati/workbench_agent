/**
 * Utility functions used across the application
 */

/**
 * Extracts the domain from a URL, removing www. prefix
 */
export const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Validates if a string is a valid HTTP(S) URL
 */
export const isValidHttpUrl = (url: string): boolean => {
  return /^https?:\/\//i.test(url);
};

/**
 * Formats a timestamp to a readable date string
 */
export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

/**
 * Formats a timestamp to a readable date and time string
 */
export const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

