import { useCallback, useEffect, useRef } from 'react';
import { getApiUrl, API_URL } from '../config';

export interface OAuthUser {
  id: string;
  username: string;
  name?: string;
  globalName?: string;
  avatar?: string;
  followersCount?: number;
  isNewUser?: boolean;
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
 * 
 * Desktop: Opens a popup window. Primary channel: postMessage. Backup: localStorage via iframe.
 * Mobile: Full-page redirect to OAuth URL. Result is decoded by App.tsx on return.
 * 
 * IMPORTANT: popup.closed is unreliable when the popup navigates cross-origin
 * (twitter.com, discord.com) — browsers may report closed=true while it's still open.
 * So we DON'T check popup.closed at all for the first 30 seconds,
 * and we ALWAYS accept postMessage even after "giving up."
 */

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    // iPad in desktop mode reports as Mac with touch support
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

export function useOAuthPopup() {
  const callbackRef = useRef<OAuthCallback | null>(null);
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fireCallback = useCallback((result: OAuthResult) => {
    if (firedRef.current) {
      console.log('[OAuth] fireCallback suppressed (already fired)');
      return;
    }
    firedRef.current = true;
    clearOAuthResult();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    console.log(`[OAuth] ✅ Firing callback: provider=${result.provider} success=${result.success}`, result.user ? `user=${result.user.username}` : result.error || '');
    callbackRef.current?.(result);
    callbackRef.current = null;
  }, []);

  // Listen for postMessage — this is the PRIMARY channel now.
  // The server's inline callback page sends: window.opener.postMessage(data, CLIENT_URL)
  // We validate the origin to prevent spoofed messages from malicious pages.
  useEffect(() => {
    // Derive the expected origin from the API URL (e.g. 'https://server.railway.app')
    const expectedOrigin = API_URL ? new URL(API_URL).origin : window.location.origin;

    const handleMessage = (event: MessageEvent) => {
      // Validate origin — only accept messages from our own server
      if (event.origin !== expectedOrigin && event.origin !== window.location.origin) {
        return;
      }

      const data = event.data;
      // Filter out noise (browser extensions, React devtools, etc.)
      if (!data || typeof data !== 'object' || !data.provider || typeof data.success !== 'boolean') return;
      console.log('[OAuth] postMessage received:', data.provider, data.success, data.user?.username || data.error || '');
      // OVERRIDE firedRef — postMessage is authoritative. If we already
      // fired a "window closed" error, undo it by accepting the real result.
      if (firedRef.current) {
        console.log('[OAuth] Late postMessage arrived — overriding previous failure');
        firedRef.current = false;
      }
      fireCallback(data as OAuthResult);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fireCallback]);

  const openOAuth = useCallback((provider: 'twitter' | 'discord', onResult: OAuthCallback) => {
    callbackRef.current = onResult;
    firedRef.current = false;
    clearOAuthResult();

    // ── Mobile: full-page redirect (popups are blocked on iOS/Android) ──
    if (isMobile()) {
      // Callback won't fire — App.tsx processes the ?ob= return param instead
      callbackRef.current = null;
      window.location.href = getApiUrl(`/auth/${provider}?return_mobile=1`);
      return;
    }

    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    console.log(`[OAuth] Opening ${provider} popup...`);
    const popup = window.open(
      getApiUrl(`/auth/${provider}`),
      `${provider}-oauth`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      console.error('[OAuth] Popup was blocked by browser');
      fireCallback({ success: false, provider, error: 'Popup blocked — please allow popups for this site' });
      return;
    }

    const openedAt = Date.now();
    // Grace period: don't check popup.closed for 30s (OAuth flow navigates
    // through twitter.com/discord.com → cross-origin → closed reads as true)
    const GRACE_PERIOD_MS = 30_000;
    // After grace period, if popup is genuinely closed, wait 5 more seconds for postMessage
    const POST_CLOSE_WAIT_MS = 5_000;

    let genuinelyClosed = false;
    let closedAt = 0;

    const timer = setInterval(() => {
      if (firedRef.current) {
        clearInterval(timer);
        timerRef.current = null;
        return;
      }

      // Check localStorage on every tick (iframe fallback writes here)
      const result = readOAuthResult();
      if (result) {
        console.log('[OAuth] Found result in localStorage:', result.provider, result.success);
        clearInterval(timer);
        timerRef.current = null;
        fireCallback(result);
        return;
      }

      const elapsed = Date.now() - openedAt;

      // Skip popup.closed checks during grace period
      if (elapsed < GRACE_PERIOD_MS) return;

      // Now safe to check popup.closed
      try {
        if (!genuinelyClosed && popup.closed) {
          genuinelyClosed = true;
          closedAt = Date.now();
          console.log('[OAuth] Popup confirmed closed (after grace period), waiting for postMessage...');
        }
      } catch {
        // Cross-origin access error — popup is still on another domain, not closed
      }

      // After confirmed close + wait period, give up
      if (genuinelyClosed && Date.now() - closedAt > POST_CLOSE_WAIT_MS) {
        clearInterval(timer);
        timerRef.current = null;
        const finalResult = readOAuthResult();
        if (finalResult) {
          console.log('[OAuth] Final localStorage check succeeded');
          fireCallback(finalResult);
        } else {
          console.warn('[OAuth] ❌ No result received — user likely closed the popup');
          fireCallback({ success: false, provider, error: 'Window closed by user' });
        }
      }
    }, 500);

    timerRef.current = timer;

    // Hard timeout: 5 minutes
    setTimeout(() => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, 5 * 60 * 1000);
  }, [fireCallback]);

  return { openOAuth };
}
