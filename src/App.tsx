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

function saveUserProfile(data: { twitterId: string; username: string; pfp: string }) {
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

function App() {
  const [screen, setScreen] = useState<Screen>('hero');

  // Scroll to top on screen change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [screen]);

  const savedProfile = loadUserProfile();
  const [userData, setUserData] = useState<UserData>({
    twitterId: savedProfile?.twitterId || '',
    username: savedProfile?.username || 'degen_whale',
    pfp: savedProfile?.pfp || 'https://api.dicebear.com/7.x/avataaars/svg?seed=degen_whale',
    tierName: 'House Legend',
    totalPoints: 0,
    followersCount: 0,
  });

  const handleGenerateClick = useCallback(() => {
    setScreen('boxes');
  }, []);

  const handleUserProfileUpdate = useCallback((twitterId: string, username: string, pfp: string) => {
    setUserData(prev => ({ ...prev, twitterId, username, pfp }));
    saveUserProfile({ twitterId, username, pfp });
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
    if (window.location.hash === '#admin') setScreen('admin');
  }, []);

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
