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
