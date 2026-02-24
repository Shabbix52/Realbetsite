import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import ParticleBackground from './components/ParticleBackground';
import GlowEffects from './components/GlowEffects';
import HeroScreen from './screens/HeroScreen';
import BoxesScreen from './screens/BoxesScreen';
import VIPScreen from './screens/VIPScreen';

export type Screen = 'hero' | 'boxes' | 'vip';

export interface UserData {
  twitterId: string;
  username: string;
  pfp: string;
  tierName: string;
  totalPoints: number;
  followersCount: number;
}

const USER_PROFILE_KEY = 'realbet_user_profile';

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

  return (
    <div className="relative min-h-screen bg-bg overflow-hidden">
      <ParticleBackground />
      <GlowEffects />

      {/* Watermark text */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
        <span className="absolute top-[15%] left-[-5%] text-[8rem] font-display font-bold text-white/[0.015] rotate-[-15deg] whitespace-nowrap">
          VOLUME WINS
        </span>
        <span className="absolute top-[45%] right-[-10%] text-[6rem] font-display font-bold text-white/[0.015] rotate-[10deg] whitespace-nowrap">
          THE HOUSE KNOWS
        </span>
        <span className="absolute bottom-[10%] left-[5%] text-[10rem] font-display font-bold text-white/[0.015] rotate-[-8deg] whitespace-nowrap">
          STAY SHARP
        </span>
      </div>

      <AnimatePresence mode="wait">
        {screen === 'hero' && (
          <HeroScreen key="hero" onGenerate={handleGenerateClick} />
        )}
        {screen === 'boxes' && (
          <BoxesScreen key="boxes" userData={userData} onComplete={handleBoxesDone} onUserProfile={handleUserProfileUpdate} />
        )}
        {screen === 'vip' && (
          <VIPScreen key="vip" userData={userData} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
