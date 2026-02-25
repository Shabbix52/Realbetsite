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

const LS_KEY = 'oauth_result';

function readOAuthResult(): OAuthResult | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.provider && typeof data.success === 'boolean') return data;
  } catch {}
  return null;
}

function clearOAuthResult() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

/**
 * Robust OAuth popup hook.
 * Primary channel: localStorage (written by oauth-callback.html, polled here).
 * Backup channel: postMessage (same-origin only).
 * 
 * Key fix: when popup closes, we DON'T immediately fail.
 * Instead we wait 3 more seconds checking localStorage, then fail.
 */
export function useOAuthPopup() {
  const callbackRef = useRef<OAuthCallback | null>(null);
  const firedRef = useRef(false);

  const fireCallback = useCallback((result: OAuthResult) => {
    if (firedRef.current) {
      console.log('[OAuth] fireCallback suppressed (already fired)');
      return;
    }
    firedRef.current = true;
    clearOAuthResult();
    console.log(`[OAuth] ✅ Firing callback: provider=${result.provider} success=${result.success}`, result.user ? `user=${result.user.username}` : result.error || '');
    callbackRef.current?.(result);
    callbackRef.current = null;
  }, []);

  // Listen for postMessage (works when popup is same-origin as parent)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as OAuthResult;
      console.log('[OAuth] postMessage received:', data);
      if (data && data.provider && typeof data.success === 'boolean') {
        console.log('[OAuth] Valid postMessage, firing callback');
        fireCallback(data);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fireCallback]);

  const openOAuth = useCallback((provider: 'twitter' | 'discord', onResult: OAuthCallback) => {
    callbackRef.current = onResult;
    firedRef.current = false;
    clearOAuthResult();

    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      getApiUrl(`/auth/${provider}`),
      `${provider}-oauth`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    let popupClosed = false;
    let closedAt = 0;

    const timer = setInterval(() => {
      if (firedRef.current) {
        clearInterval(timer);
        return;
      }

      // Check localStorage on every tick
      const result = readOAuthResult();
      if (result) {
        console.log('[OAuth] Found result in localStorage:', result.provider, result.success);
        clearInterval(timer);
        fireCallback(result);
        return;
      }

      // Detect popup close
      if (!popupClosed && popup && popup.closed) {
        popupClosed = true;
        closedAt = Date.now();
        console.log('[OAuth] Popup closed, waiting 3s for localStorage...');
      }

      // After popup closed, keep polling localStorage for 3s before giving up
      if (popupClosed && Date.now() - closedAt > 3000) {
        clearInterval(timer);
        // One final check
        const finalResult = readOAuthResult();
        if (finalResult) {
          console.log('[OAuth] Final localStorage check succeeded');
          fireCallback(finalResult);
        } else {
          console.warn('[OAuth] ❌ Giving up — no result in localStorage after popup closed');
          fireCallback({
            success: false,
            provider,
            error: 'Window closed by user',
          });
        }
      }
    }, 400);

    // Safety: clear interval after 5 minutes regardless
    setTimeout(() => {
      clearInterval(timer);
    }, 5 * 60 * 1000);
  }, [fireCallback]);

  return { openOAuth };
}
