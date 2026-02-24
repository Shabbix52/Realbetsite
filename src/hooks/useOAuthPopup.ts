import { useCallback, useEffect, useRef } from 'react';
import { getApiUrl } from '../config';

export interface OAuthUser {
  id: string;
  username: string;
  name?: string;
  globalName?: string;
  avatar?: string;
  followersCount?: number;
}

export interface OAuthResult {
  success: boolean;
  provider: 'twitter' | 'discord';
  error?: string | null;
  user?: OAuthUser | null;
}

type OAuthCallback = (result: OAuthResult) => void;

/**
 * Hook that opens an OAuth popup and listens for the postMessage result.
 * Falls back to localStorage polling if postMessage fails (cross-origin).
 */
export function useOAuthPopup() {
  const callbackRef = useRef<OAuthCallback | null>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as OAuthResult;
      if (data && data.provider && typeof data.success === 'boolean') {
        // Clear the localStorage fallback so it doesn't fire twice
        try { localStorage.removeItem('oauth_result'); } catch {}
        callbackRef.current?.(data);
        callbackRef.current = null;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const openOAuth = useCallback((provider: 'twitter' | 'discord', onResult: OAuthCallback) => {
    callbackRef.current = onResult;

    // Clear any stale oauth_result before opening
    try { localStorage.removeItem('oauth_result'); } catch {}

    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      getApiUrl(`/auth/${provider}`),
      `${provider}-oauth`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    popupRef.current = popup;

    // Poll for popup closure and check localStorage fallback
    const timer = setInterval(() => {
      // Check localStorage fallback (cross-origin postMessage may have failed)
      try {
        const stored = localStorage.getItem('oauth_result');
        if (stored) {
          localStorage.removeItem('oauth_result');
          const data = JSON.parse(stored) as OAuthResult;
          if (data && data.provider && typeof data.success === 'boolean' && callbackRef.current) {
            clearInterval(timer);
            callbackRef.current(data);
            callbackRef.current = null;
            return;
          }
        }
      } catch {}

      if (popup && popup.closed) {
        clearInterval(timer);
        if (callbackRef.current) {
          callbackRef.current({
            success: false,
            provider,
            error: 'Window closed by user',
          });
          callbackRef.current = null;
        }
      }
    }, 500);
  }, []);

  return { openOAuth };
}
