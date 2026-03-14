import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import GlowEffects from './components/GlowEffects';
import BloodStainOverlay from './components/BloodStainOverlay';
import { useSession } from './context/SessionContext';
import HeroScreen from './screens/HeroScreen';
import BoxesScreen from './screens/BoxesScreen';
import VIPScreen from './screens/VIPScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import AdminScreen from './screens/AdminScreen';

export type Screen = 'hero' | 'boxes' | 'vip' | 'leaderboard' | 'admin';

function App() {
  const { userData, mobileOAuthResult, claimResult, setUserProfile, setUserProgress, setUserPoints, logout } = useSession();
  const [screen, setScreen] = useState<Screen>(() => {
    if (claimResult && userData.twitterId) return 'vip';
    if (mobileOAuthResult) return 'boxes';
    if (window.location.hash === '#admin') return 'admin';
    return 'hero';
  });

  // Scroll to top on screen change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [screen]);

  const handleGenerateClick = useCallback(() => {
    setScreen('boxes');
  }, []);

  const handleUserProfileUpdate = useCallback((twitterId: string, username: string, pfp: string, isNewUser?: boolean) => {
    setUserProfile(twitterId, username, pfp, isNewUser);
  }, [setUserProfile]);

  const handleBoxesDone = useCallback((points: number, tierName: string, followersCount: number) => {
    setUserProgress(points, tierName, followersCount);
    setScreen('vip');
  }, [setUserProgress]);

  const handleUpdatePoints = useCallback((totalPoints: number, followersCount: number) => {
    setUserPoints(totalPoints, followersCount);
  }, [setUserPoints]);

  const handleLogout = useCallback(() => {
    logout();
    setScreen('hero');
  }, [logout]);

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
          <VIPScreen key="vip" userData={userData} onLeaderboard={() => setScreen('leaderboard')} onLogout={handleLogout} onUpdatePoints={handleUpdatePoints} />
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
