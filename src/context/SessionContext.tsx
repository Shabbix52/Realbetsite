import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { sanitizeAvatarUrl } from '../config';

export interface UserData {
  twitterId: string;
  username: string;
  pfp: string;
  tierName: string;
  totalPoints: number;
  followersCount: number;
  isNewUser?: boolean;
}

interface SessionContextValue {
  userData: UserData;
  mobileOAuthResult: Partial<UserData> | null;
  claimResult: string | null;
  setUserProfile: (twitterId: string, username: string, pfp: string, isNewUser?: boolean) => void;
  setUserProgress: (totalPoints: number, tierName: string, followersCount: number) => void;
  setUserPoints: (totalPoints: number, followersCount: number) => void;
  logout: () => void;
}

const USER_PROFILE_KEY = 'realbet_user_profile';
const REFERRAL_CODE_KEY = 'realbet_referral_code';
const AUTH_STATE_KEY = 'realbet_auth_state';
const CLAIM_RESULT_KEY = 'realbet_claim_result';

const SessionContext = createContext<SessionContextValue | null>(null);

function loadUserProfile(): Partial<UserData> | null {
  try {
    const saved = localStorage.getItem(USER_PROFILE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveUserProfile(data: Partial<UserData>) {
  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures
  }
}

function captureReferralCode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (!refCode) return;
    localStorage.setItem(REFERRAL_CODE_KEY, refCode.toUpperCase());
    const url = new URL(window.location.href);
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.pathname + url.hash);
  } catch {
    // ignore malformed URLs / storage failures
  }
}

function processMobileOAuthReturn(): Partial<UserData> | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const ob = params.get('ob');
    if (!ob) return null;

    const url = new URL(window.location.href);
    url.searchParams.delete('ob');
    window.history.replaceState({}, '', url.pathname + (url.search || '') + (url.hash || ''));

    const json = atob(ob.replace(/-/g, '+').replace(/_/g, '/'));
    const result = JSON.parse(json);
    if (!result || typeof result.success !== 'boolean' || !result.provider) return null;
    if (!result.success || !result.user) return null;

    const user = result.user;
    if (typeof user.id !== 'string' || user.id.length > 100) return null;
    if (typeof user.username !== 'string' || user.username.length > 100) return null;
    if (user.avatar !== undefined && typeof user.avatar !== 'string') return null;
    if (user.followersCount !== undefined && (
      typeof user.followersCount !== 'number' ||
      user.followersCount < 0 ||
      user.followersCount > 10_000_000
    )) return null;

    const pfp = sanitizeAvatarUrl(
      user.avatar
        ? user.avatar.replace('_normal', '_400x400')
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`
    );

    const existingRaw = localStorage.getItem(AUTH_STATE_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;

    if (result.provider === 'twitter') {
      localStorage.setItem(AUTH_STATE_KEY, JSON.stringify({
        twitterVerified: true,
        twitterId: user.id,
        twitterUsername: user.username,
        followersCount: user.followersCount || 0,
        discordVerified: existing?.discordVerified || false,
        discordUserId: existing?.discordUserId || null,
        tasks: {
          follow: existing?.tasks?.follow || false,
          discord: existing?.tasks?.discord || false,
        },
      }));
      return { twitterId: user.id, username: user.username, pfp, isNewUser: user.isNewUser };
    }

    if (result.provider === 'discord') {
      localStorage.setItem(AUTH_STATE_KEY, JSON.stringify({
        twitterVerified: existing?.twitterVerified || false,
        twitterId: existing?.twitterId || null,
        twitterUsername: existing?.twitterUsername || null,
        followersCount: existing?.followersCount || 0,
        discordVerified: true,
        discordUserId: user.id,
        tasks: {
          follow: existing?.tasks?.follow || false,
          discord: existing?.tasks?.discord || false,
        },
      }));
      return existing?.twitterId
        ? { twitterId: existing.twitterId, username: existing.twitterUsername || '', pfp }
        : null;
    }

    return null;
  } catch {
    return null;
  }
}

function captureClaimResult(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('claim_result');
    if (!result) return null;
    localStorage.setItem(CLAIM_RESULT_KEY, result);
    const url = new URL(window.location.href);
    url.searchParams.delete('claim_result');
    url.searchParams.delete('claim_msg');
    window.history.replaceState({}, '', url.pathname + (url.search || '') + (url.hash || ''));
    return result;
  } catch {
    return null;
  }
}

captureReferralCode();
const capturedMobileOAuthResult = processMobileOAuthReturn();
const capturedClaimResult = captureClaimResult();

function getInitialUserData(mobileOAuthResult: Partial<UserData> | null): UserData {
  const savedProfile = loadUserProfile();
  const profile = mobileOAuthResult || savedProfile;

  if (mobileOAuthResult) {
    saveUserProfile(mobileOAuthResult);
  }

  return {
    twitterId: profile?.twitterId || '',
    username: profile?.username || 'degen_whale',
    pfp: profile?.pfp || 'https://api.dicebear.com/7.x/avataaars/svg?seed=degen_whale',
    tierName: profile?.tierName || 'House Legend',
    totalPoints: profile?.totalPoints || 0,
    followersCount: profile?.followersCount || 0,
    isNewUser: mobileOAuthResult?.isNewUser,
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [userData, setUserData] = useState<UserData>(() => getInitialUserData(capturedMobileOAuthResult));

  const setUserProfile = useCallback((twitterId: string, username: string, pfp: string, isNewUser?: boolean) => {
    setUserData((prev) => {
      const updated = { ...prev, twitterId, username, pfp: sanitizeAvatarUrl(pfp), isNewUser };
      saveUserProfile(updated);
      return updated;
    });
  }, []);

  const setUserProgress = useCallback((totalPoints: number, tierName: string, followersCount: number) => {
    setUserData((prev) => {
      const updated = { ...prev, totalPoints, tierName, followersCount };
      saveUserProfile(updated);
      return updated;
    });
  }, []);

  const setUserPoints = useCallback((totalPoints: number, followersCount: number) => {
    setUserData((prev) => {
      const updated = { ...prev, totalPoints, followersCount };
      saveUserProfile(updated);
      return updated;
    });
  }, []);

  const logout = useCallback(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('realbet_') && !key.startsWith('realbet_shared_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
      // ignore storage failures
    }

    setUserData({
      twitterId: '',
      username: 'degen_whale',
      pfp: 'https://api.dicebear.com/7.x/avataaars/svg?seed=degen_whale',
      tierName: 'House Legend',
      totalPoints: 0,
      followersCount: 0,
    });
  }, []);

  const value = useMemo(() => ({
    userData,
    mobileOAuthResult: capturedMobileOAuthResult,
    claimResult: capturedClaimResult,
    setUserProfile,
    setUserProgress,
    setUserPoints,
    logout,
  }), [logout, setUserPoints, setUserProfile, setUserProgress, userData]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}