import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import GlowEffects from './components/GlowEffects';
import BloodStainOverlay from './components/BloodStainOverlay';
import HeroScreen from './screens/HeroScreen';
import BoxesScreen from './screens/BoxesScreen';
import VIPScreen from './screens/VIPScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import AdminScreen from './screens/AdminScreen';

export type Screen = 'hero' | 'boxes' | 'vip' | 'leaderboard' | 'admin';

export interface UserData {
  twitterId: string;
  username: string;
  pfp: string;
  tierName: string;
  totalPoints: number;
  followersCount: number;
  isNewUser?: boolean;
}

const USER_PROFILE_KEY = 'realbet_user_profile';
const REFERRAL_CODE_KEY = 'realbet_referral_code';

function loadUserProfile(): Partial<UserData> | null {
  try {
    const saved = localStorage.getItem(USER_PROFILE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch { return null; }
}

function saveUserProfile(data: { twitterId: string; username: string; pfp: string; isNewUser?: boolean }) {
  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

// Capture referral code from URL on first load
function captureReferralCode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem(REFERRAL_CODE_KEY, refCode.toUpperCase());
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.pathname + url.hash);
    }
  } catch { /* ignore */ }
}

captureReferralCode();

// Process mobile OAuth redirect return (?ob=<base64url_payload>)
// Must run before React renders so BoxesScreen picks up saved auth state
const AUTH_STATE_KEY_APP = 'realbet_auth_state';
function processMobileOAuthReturn(): { twitterId: string; username: string; pfp: string; isNewUser?: boolean } | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const ob = params.get('ob');
    if (!ob) return null;

    // Clean the URL immediately
    const url = new URL(window.location.href);
    url.searchParams.delete('ob');
    window.history.replaceState({}, '', url.pathname + (url.search || '') + (url.hash || ''));

    // Decode base64url payload
    const json = atob(ob.replace(/-/g, '+').replace(/_/g, '/'));
    const result = JSON.parse(json);
    if (!result || typeof result.success !== 'boolean' || !result.provider) return null;
    if (!result.success || !result.user) return null;

    const user = result.user;
    const pfp = user.avatar
      ? user.avatar.replace('_normal', '_400x400')
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`;

    // Write auth state for BoxesScreen to read on mount
    const existingRaw = localStorage.getItem(AUTH_STATE_KEY_APP);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;
    if (result.provider === 'twitter') {
      localStorage.setItem(AUTH_STATE_KEY_APP, JSON.stringify({
        twitterVerified: true,
        twitterId: user.id,
        twitterUsername: user.username,
        followersCount: user.followersCount || 0,
        discordVerified: existing?.discordVerified || false,
        discordUserId: existing?.discordUserId || null,
        tasks: { follow: existing?.tasks?.follow || false, discord: existing?.tasks?.discord || false },
      }));
      return { twitterId: user.id, username: user.username, pfp, isNewUser: user.isNewUser };
    }
    if (result.provider === 'discord') {
      localStorage.setItem(AUTH_STATE_KEY_APP, JSON.stringify({
        twitterVerified: existing?.twitterVerified || false,
        twitterId: existing?.twitterId || null,
        twitterUsername: existing?.twitterUsername || null,
        followersCount: existing?.followersCount || 0,
        discordVerified: true,
        discordUserId: user.id,
        tasks: { follow: existing?.tasks?.follow || false, discord: existing?.tasks?.discord || false },
      }));
      return existing?.twitterId ? { twitterId: existing.twitterId, username: existing.twitterUsername || '', pfp } : null;
    }
    return null;
  } catch { return null; }
}
const mobileOAuthResult = processMobileOAuthReturn();

function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    if (mobileOAuthResult) return 'boxes';
    if (window.location.hash === '#admin') return 'admin';
    return 'hero';
  });

  // Scroll to top on screen change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [screen]);

  const savedProfile = loadUserProfile();
  const [userData, setUserData] = useState<UserData>(() => {
    const profile = mobileOAuthResult || savedProfile;
    if (mobileOAuthResult) {
      // Persist the returned profile so future mounts don't need the URL param
      try { localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(mobileOAuthResult)); } catch { /* ignore */ }
    }
    return {
      twitterId: profile?.twitterId || '',
      username: profile?.username || 'degen_whale',
      pfp: profile?.pfp || 'https://api.dicebear.com/7.x/avataaars/svg?seed=degen_whale',
      tierName: 'House Legend',
      totalPoints: 0,
      followersCount: 0,
      isNewUser: mobileOAuthResult?.isNewUser,
    };
  });

  const handleGenerateClick = useCallback(() => {
    setScreen('boxes');
  }, []);

  const handleUserProfileUpdate = useCallback((twitterId: string, username: string, pfp: string, isNewUser?: boolean) => {
    setUserData(prev => ({ ...prev, twitterId, username, pfp, isNewUser }));
    saveUserProfile({ twitterId, username, pfp, isNewUser });
  }, []);

  const handleBoxesDone = useCallback((points: number, tierName: string, followersCount: number) => {
    setUserData(prev => ({
      ...prev,
      totalPoints: points,
      tierName,
      followersCount,
    }));
    setScreen('vip');
  }, []);

  // Check URL hash for admin route on load
  useEffect(() => {
    if (window.location.hash === '#admin' && screen !== 'admin') setScreen('admin');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-screen h-screen overflow-y-auto overflow-x-hidden grain-overlay">
      <GlowEffects />
      <BloodStainOverlay />

      <AnimatePresence mode="wait">
        {screen === 'hero' && (
          <HeroScreen key="hero" onGenerate={handleGenerateClick} />
        )}
        {screen === 'boxes' && (
          <BoxesScreen key="boxes" userData={userData} onComplete={handleBoxesDone} onUserProfile={handleUserProfileUpdate} />
        )}
        {screen === 'vip' && (
          <VIPScreen key="vip" userData={userData} onLeaderboard={() => setScreen('leaderboard')} />
        )}
        {screen === 'leaderboard' && (
          <LeaderboardScreen key="leaderboard" onBack={() => setScreen('vip')} currentUsername={userData.username} />
        )}
        {screen === 'admin' && (
          <AdminScreen key="admin" onBack={() => setScreen('hero')} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
