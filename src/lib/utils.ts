/**
 * Utility functions used across the application
 */

/**
 * Extracts the domain from a URL, removing www. prefix
 */
export const isFileUrl = (url: string): boolean => {
  return /^file:\/\//i.test(url.trim());
};

export const getDomain = (url: string): string => {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') {
      const name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
      return name ? `file · ${name}` : 'Local file';
    }
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Bookmarkable URL: http(s) or local file opened in the browser. */
export const isValidBookmarkUrl = (url: string): boolean => {
  const t = url.trim();
  return /^https?:\/\//i.test(t) || isFileUrl(t);
};

/**
 * Validates if a string is a valid HTTP(S) URL
 */
export const isValidHttpUrl = (url: string): boolean => {
  return /^https?:\/\//i.test(url.trim());
};

/** Display name for a file:// bookmark URL. */
export const fileUrlBasename = (url: string): string => {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    return name || 'Local file';
  } catch {
    return 'Local file';
  }
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

