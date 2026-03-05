/**
 * API Configuration
 * 
 * In development: Uses Vite proxy (/auth → http://localhost:3001/auth)
 * In production: Uses Railway backend URL directly
 */

export const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Get full API endpoint URL
 * @param path - API path starting with /auth
 */
export function getApiUrl(path: string): string {
  return `${API_URL}${path}`;
}

const ALLOWED_AVATAR_HOSTS = new Set(['pbs.twimg.com', 'cdn.discordapp.com', 'api.dicebear.com']);

/**
 * Validates an avatar URL against a known-safe hostname allowlist.
 * Prevents javascript: XSS and loading from unexpected domains.
 */
export function sanitizeAvatarUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && ALLOWED_AVATAR_HOSTS.has(parsed.hostname)) return url;
  } catch { /* invalid URL */ }
  return 'https://api.dicebear.com/7.x/avataaars/svg?seed=unknown';
}
