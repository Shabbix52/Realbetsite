import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrowserProvider, formatEther } from 'ethers';
import type { UserData } from '../App';
import { useCountUp } from '../hooks/useCountUp';
import { useOAuthPopup } from '../hooks/useOAuthPopup';
import { getApiUrl } from '../config';

type BoxType = 'bronze' | 'silver' | 'gold';
type BoxState = 'locked' | 'ready' | 'opening' | 'revealed';
type SubScreen = 'boxes' | 'tasks' | 'gold-pre' | 'gold-reveal';

interface BoxData {
  type: BoxType;
  state: BoxState;
  points: number;
  tierName: string;
}

const TIER_NAMES: Record<BoxType, string[]> = {
  bronze: ['Pit Boss Prospect', 'Table Rookie', 'Chip Stacker', 'House Hopeful'],
  silver: ['High Roller', 'VIP Candidate', 'Felt Walker', 'Card Counter'],
  gold: ['House Legend', 'Whale Status', 'Inner Circle', 'The Chosen'],
};

const BOX_GRADIENTS: Record<BoxType, string> = {
  bronze: 'linear-gradient(145deg, #8B6E4E 0%, #6B4E34 40%, #4A3728 100%)',
  silver: 'linear-gradient(145deg, #9CA0A8 0%, #6B7080 40%, #4A4E5A 100%)',
  gold: 'linear-gradient(145deg, #F6C34A 0%, #C9982E 40%, #8B6914 100%)',
};

const BOX_POINTS: Record<BoxType, [number, number]> = {
  bronze: [500, 1500],
  silver: [2000, 5000],
  gold: [10000, 25000],
};

const BOX_TITLE_COLORS: Record<BoxType, string> = {
  bronze: 'text-[#C8956C]',
  silver: 'text-[#9CA0A8]',
  gold: 'text-[#F6C34A]',
};

const STEP_LABELS: Record<SubScreen, string> = {
  boxes: 'Boxes',
  tasks: 'Tasks',
  'gold-pre': 'Gold Box',
  'gold-reveal': 'Reveal',
};

function randomInRange(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Follower-based multiplier for point ranges */
function followerMultiplier(followers: number): number {
  if (followers >= 50000) return 4;
  if (followers >= 10000) return 3;
  if (followers >= 1000)  return 2;
  if (followers >= 100)   return 1.5;
  return 1;
}

function scaledPointRange(type: BoxType, followers: number): [number, number] {
  const [min, max] = BOX_POINTS[type];
  const m = followerMultiplier(followers);
  return [Math.floor(min * m), Math.floor(max * m)];
}

const STORAGE_KEY = 'realbet_box_results';

function loadSavedBoxes(): BoxData[] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch { return null; }
}

function saveBoxes(boxes: BoxData[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boxes));
  } catch { /* ignore */ }
}

interface BoxesScreenProps {
  userData: UserData;
  onComplete: (points: number, tierName: string, multiplier: number, walletAddress?: string) => void;
  onUserProfile: (twitterId: string, username: string, pfp: string) => void;
}

const BoxesScreen = ({ onComplete, onUserProfile }: BoxesScreenProps) => {
  // Load saved box results or start fresh
  const savedBoxes = loadSavedBoxes();
  const initialBoxes: BoxData[] = savedBoxes || [
    { type: 'bronze', state: 'ready', points: 0, tierName: '' },
    { type: 'silver', state: 'locked', points: 0, tierName: '' },
    { type: 'gold', state: 'locked', points: 0, tierName: '' },
  ];

  // Determine the correct initial sub-screen from saved state
  function deriveSubScreen(b: BoxData[]): SubScreen {
    const gold = b.find(x => x.type === 'gold');
    const silver = b.find(x => x.type === 'silver');
    if (gold?.state === 'revealed') return 'gold-reveal';
    if (gold?.state === 'ready') return 'gold-pre';
    if (silver?.state === 'revealed') return 'tasks';
    return 'boxes';
  }

  const [subScreen, setSubScreen] = useState<SubScreen>(() => deriveSubScreen(initialBoxes));
  const [twitterId, setTwitterId] = useState<string | null>(null);
  const [twitterUsername, setTwitterUsername] = useState<string | null>(null);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [boxes, setBoxes] = useState<BoxData[]>(initialBoxes);

  const [tasks, setTasks] = useState({
    follow: false,
    discord: false,
    wallet: false,
  });
  const [twitterVerified, setTwitterVerified] = useState(false);
  const [discordVerified, setDiscordVerified] = useState(false);
  const [discordUserId, setDiscordUserId] = useState<string | null>(null);
  const [taskLoading, setTaskLoading] = useState<string | null>(null);
  const [walletData, setWalletData] = useState<{ address: string; fullAddress: string; balance: number; chain: string; multiplier: number } | null>(null);
  const [allDone, setAllDone] = useState(() => {
    const gold = initialBoxes.find(b => b.type === 'gold');
    return gold?.state === 'revealed';
  });

  const { openOAuth } = useOAuthPopup();

  // Save scores to DB
  const saveScoresToDB = useCallback(async (currentBoxes: BoxData[], mult?: number) => {
    const tid = twitterId;
    if (!tid) return;
    const total = currentBoxes.reduce((sum, b) => sum + b.points, 0);
    const m = mult ?? (walletData ? walletData.multiplier : 1);
    try {
      await fetch(getApiUrl('/auth/scores'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitterId: tid,
          username: twitterUsername,
          followersCount,
          boxes: currentBoxes,
          walletMultiplier: m,
          totalPoints: Math.floor(total * m),
        }),
      });
    } catch { /* non-blocking */ }
  }, [twitterId, twitterUsername, followersCount, walletData]);

  const totalPoints = boxes.reduce((sum, b) => sum + b.points, 0);
  const multiplier = walletData ? walletData.multiplier : 1;
  const adjustedTotal = Math.floor(totalPoints * multiplier);
  const displayTotal = useCountUp(adjustedTotal, 1000);
  const completedTasks = [tasks.follow, tasks.discord, tasks.wallet].filter(Boolean).length;

  const openBox = useCallback((index: number) => {
    const box = boxes[index];
    if (box.state !== 'ready') return;

    // Set to opening
    setBoxes(prev => prev.map((b, i) => i === index ? { ...b, state: 'opening' } : b));

    // After shake animation, reveal
    setTimeout(() => {
      const [min, max] = scaledPointRange(box.type, followersCount);
      const points = randomInRange(min, max);
      const tierName = pickRandom(TIER_NAMES[box.type]);

      setBoxes(prev => {
        const updated = prev.map((b, i) => {
          if (i === index) return { ...b, state: 'revealed' as BoxState, points, tierName };
          // Unlock next box (bronze → silver)
          if (i === index + 1 && b.state === 'locked' && box.type === 'bronze') {
            return { ...b, state: 'ready' as BoxState };
          }
          return b;
        });
        saveBoxes(updated);
        saveScoresToDB(updated);
        return updated;
      });

      // After silver is revealed, transition to tasks screen
      if (box.type === 'silver') {
        setTimeout(() => setSubScreen('tasks'), 1500);
      }

      // After gold is revealed, transition to gold-reveal then complete
      if (box.type === 'gold') {
        setTimeout(() => {
          setSubScreen('gold-reveal');
          setTimeout(() => setAllDone(true), 800);
        }, 500);
      }
    }, 1300);
  }, [boxes]);

  const checkAllTasks = useCallback((updatedTasks: typeof tasks) => {
    if (updatedTasks.follow && updatedTasks.discord) {
      setBoxes(prev => prev.map(b => b.type === 'gold' ? { ...b, state: 'ready' } : b));
      setTimeout(() => setSubScreen('gold-pre'), 800);
    }
  }, []);

  const handleTask = useCallback(async (task: 'follow' | 'discord' | 'wallet') => {
    if (taskLoading) return;

    // ── Twitter / X ──
    if (task === 'follow') {
      if (!twitterVerified) {
        setTaskLoading('follow');
        openOAuth('twitter', (result) => {
          if (result.success) {
            setTwitterVerified(true);
            if (result.user?.id) {
              setTwitterId(result.user.id);
            }
            if (result.user?.followersCount !== undefined) {
              setFollowersCount(result.user.followersCount);
            }
            if (result.user?.username) {
              setTwitterUsername(result.user.username);
              const pfp = result.user.avatar
                ? result.user.avatar.replace('_normal', '_400x400')
                : `https://api.dicebear.com/7.x/avataaars/svg?seed=${result.user.username}`;
              onUserProfile(result.user.id || '', result.user.username, pfp);

              // Load existing scores from DB
              if (result.user.id) {
                fetch(getApiUrl(`/auth/scores/${result.user.id}`))
                  .then(r => r.json())
                  .then(data => {
                    if (data && data.boxes) {
                      const hasPoints = data.boxes.some((b: any) => b.points > 0);
                      if (hasPoints) {
                        setBoxes(data.boxes);
                        saveBoxes(data.boxes);
                      }
                    }
                    if (data && data.followersCount) {
                      setFollowersCount(data.followersCount);
                    }
                  })
                  .catch(() => { /* ignore */ });
              }
            }
          }
          setTaskLoading(null);
        });
      } else {
        window.open('https://x.com/Realbet', '_blank');
        setTaskLoading('follow');
        setTimeout(() => {
          setTasks(p => {
            const updated = { ...p, follow: true };
            checkAllTasks(updated);
            return updated;
          });
          setTaskLoading(null);
        }, 15000);
      }
      return;
    }

    // ── Discord ──
    if (task === 'discord') {
      if (!discordVerified) {
        setTaskLoading('discord');
        openOAuth('discord', (result) => {
          if (result.success && result.user?.id) {
            setDiscordVerified(true);
            setDiscordUserId(result.user.id);
          }
          setTaskLoading(null);
        });
      } else {
        window.open('https://discord.gg/realbetio', '_blank');
        setTaskLoading('discord');
        let attempts = 0;
        const maxAttempts = 15;

        const checkMembership = async () => {
          attempts++;
          try {
            const res = await fetch(getApiUrl(`/auth/discord/check-member/${discordUserId}`));
            const data = await res.json();
            if (data.member) {
              setTasks(p => {
                const updated = { ...p, discord: true };
                checkAllTasks(updated);
                return updated;
              });
              setTaskLoading(null);
              return;
            }
          } catch { /* retry */ }

          if (attempts < maxAttempts) {
            setTimeout(checkMembership, 2000);
          } else {
            setTaskLoading(null);
          }
        };

        setTimeout(checkMembership, 1000);
      }
      return;
    }

    // ── Wallet ──
    if (task === 'wallet') {
      setTaskLoading('wallet');

      try {
        if (!window.ethereum) {
          window.open('https://metamask.io/download/', '_blank');
          setTaskLoading(null);
          return;
        }

        const provider = new BrowserProvider(window.ethereum);
        const accounts = await provider.send('eth_requestAccounts', []);
        const address = accounts[0];

        const balance = await provider.getBalance(address);
        const network = await provider.getNetwork();
        const balEth = parseFloat(formatEther(balance));

        const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
        const mult = Math.min(1 + balEth * 0.1, 4);

        setTasks(prev => {
          const updated = { ...prev, wallet: true };
          checkAllTasks(updated);
          return updated;
        });

        setWalletData({
          address: shortAddr,
          fullAddress: address,
          balance: Math.round(balEth * 10000) / 10000,
          chain: network.name,
          multiplier: Math.round(mult * 10) / 10,
        });

        try {
          await fetch(getApiUrl('/auth/wallet'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, chain: network.name, balance: balEth }),
          });
        } catch { /* non-blocking */ }
      } catch (err: any) {
        console.error('Wallet connection failed:', err);
      }

      setTaskLoading(null);
    }
  }, [taskLoading, openOAuth, discordUserId, onUserProfile, checkAllTasks]);

  const handleContinue = () => {
    const finalTier = boxes[2].tierName || boxes[1].tierName || boxes[0].tierName;
    saveScoresToDB(boxes, multiplier);
    onComplete(adjustedTotal, finalTier, multiplier, walletData?.fullAddress);
  };

  // Auto-advance to VIP if gold was already revealed on mount
  const goldAlreadyRevealed = initialBoxes.find(b => b.type === 'gold')?.state === 'revealed';
  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (goldAlreadyRevealed && !autoAdvancedRef.current) {
      autoAdvancedRef.current = true;
      const finalTier = initialBoxes[2].tierName || initialBoxes[1].tierName || initialBoxes[0].tierName;
      const total = initialBoxes.reduce((s, b) => s + b.points, 0);
      const timer = setTimeout(() => {
        onComplete(Math.floor(total * multiplier), finalTier, multiplier);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const stepNumber = subScreen === 'boxes' ? 2 : subScreen === 'tasks' ? 3 : subScreen === 'gold-pre' ? 4 : 5;

  // Lock icon SVG
  const LockIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );

  // Package/Gift icon SVG
  const PackageIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );

  // CheckCircle icon
  const CheckCircleIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );

  return (
    <>
      {/* Step indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed top-4 right-4 z-50"
      >
        <span className="font-label text-[10px] tracking-[0.15em] text-rb-muted/40">
          Step {stepNumber}/7 • {STEP_LABELS[subScreen]}
        </span>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ═══ BOXES SCREEN ═══ */}
        {subScreen === 'boxes' && (
          <motion.section
            key="boxes"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
            className="h-screen flex flex-col items-center justify-center relative px-6 z-10"
          >
            <motion.div className="w-full max-w-3xl mx-auto">
              {/* Label */}
              <p className="font-label text-[10px] tracking-[0.25em] text-rb-muted/40 mb-3">
                // LOOT DROP
              </p>

              {/* Heading */}
              <h2 className="font-display text-4xl md:text-6xl font-bold mb-3 tracking-tight uppercase">
                Mystery{' '}
                <span className="text-brand-red">Boxes</span>
              </h2>

              {/* Description */}
              <p className="text-rb-muted/60 text-sm mb-10 max-w-md">
                Each box reveals points. Points convert to Season 1 credit.
              </p>

              {/* Boxes Grid — only bronze & silver */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                {boxes.slice(0, 2).map((box, i) => (
                  <motion.div
                    key={box.type}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 + 0.2 }}
                    whileHover={box.state === 'ready' ? { y: -8, scale: 1.02 } : {}}
                    whileTap={box.state === 'ready' ? { scale: 0.97 } : {}}
                    onClick={() => box.state === 'ready' ? openBox(i) : undefined}
                    className={`relative glass-panel rounded-2xl p-8 text-center min-h-[240px] flex flex-col items-center justify-center transition-all duration-500 ${
                      box.state === 'ready'
                        ? 'cursor-pointer hover:border-white/20'
                        : box.state === 'locked'
                        ? 'cursor-not-allowed opacity-50'
                        : ''
                    } ${box.state === 'opening' ? 'animate-shake' : ''}`}
                    style={{
                      boxShadow: box.state === 'ready' || box.state === 'revealed'
                        ? '0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)'
                        : 'none',
                    }}
                  >
                    {/* Color overlay at 8% opacity */}
                    <div
                      className="absolute inset-0 rounded-2xl opacity-[0.08]"
                      style={{ background: BOX_GRADIENTS[box.type] }}
                    />

                    {/* Flash overlay for opening */}
                    {box.state === 'opening' && (
                      <div className="absolute inset-0 rounded-2xl bg-white animate-box-flash z-10 pointer-events-none" />
                    )}

                    {/* Icon */}
                    <div className="mb-4 relative z-[1]">
                      {box.state === 'locked' ? (
                        <LockIcon className="w-12 h-12 text-rb-muted/30" />
                      ) : box.state === 'opening' ? (
                        <PackageIcon className="w-12 h-12 text-white animate-bounce" />
                      ) : box.state === 'revealed' ? (
                        <motion.div
                          initial={{ scale: 0.5 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', damping: 12 }}
                        >
                          <PackageIcon className="w-10 h-10 text-white/50" />
                        </motion.div>
                      ) : (
                        <PackageIcon className="w-12 h-12 text-white/70" />
                      )}
                    </div>

                    {/* Label */}
                    <h3 className={`font-display text-lg tracking-wider uppercase mb-1 relative z-[1] ${BOX_TITLE_COLORS[box.type]}`}>
                      {box.type} Box
                    </h3>

                    {/* State-specific content */}
                    {box.state === 'locked' && (
                      <div className="flex items-center gap-1.5 relative z-[1]">
                        <LockIcon className="w-3 h-3 text-rb-muted/30" />
                        <span className="font-label text-[10px] text-rb-muted/30 tracking-wider">
                          Open Bronze first
                        </span>
                      </div>
                    )}

                    {box.state === 'ready' && (
                      <p className="font-label text-[10px] text-rb-muted/40 tracking-widest uppercase animate-pulse relative z-[1]">Tap to open</p>
                    )}

                    {box.state === 'revealed' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', damping: 12 }}
                        className="relative z-[1]"
                      >
                        <p className="text-3xl font-bold font-label text-white">
                          +{box.points.toLocaleString()}
                        </p>
                        <p className="text-xs text-rb-muted/40 font-label">points</p>
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Running Total */}
              <AnimatePresence>
                {totalPoints > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center"
                  >
                    <p className="font-label text-[10px] tracking-[0.25em] text-rb-muted/40 uppercase mb-1">
                      Current Total
                    </p>
                    <p className="text-3xl font-bold font-label tracking-tight text-white">
                      {displayTotal.toLocaleString()} <span className="text-rb-muted/40 text-base">pts</span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Unlocking next phase message after silver */}
              {boxes[1].state === 'revealed' && subScreen === 'boxes' && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-rb-muted/40 text-xs font-label tracking-wider mt-6"
                >
                  Unlocking next phase...
                </motion.p>
              )}
            </motion.div>
          </motion.section>
        )}

        {/* ═══ TASKS SCREEN ═══ */}
        {subScreen === 'tasks' && (
          <motion.section
            key="tasks"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
            className="h-screen flex flex-col items-center justify-center relative px-6 z-10"
          >
            <motion.div className="w-full max-w-lg mx-auto">
              {/* Label */}
              <p className="font-label text-[10px] tracking-[0.25em] text-rb-muted/40 mb-3">
                // THE FINAL BOX
              </p>

              {/* Heading */}
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-3 tracking-tight uppercase">
                Unlock{' '}
                <span className="text-brand-gold">Gold Box</span>
              </h2>

              {/* Description */}
              <p className="text-rb-muted/60 text-sm mb-10">
                Complete these steps to unlock your biggest reward.
              </p>

              {/* Progress bar */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label text-[10px] tracking-wider text-rb-muted/50">Gold Box Unlock</span>
                  <span className="font-label text-[10px] tracking-wider text-rb-muted/50">{completedTasks}/3 completed</span>
                </div>
                <div className="h-1 bg-rb-border rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-brand-gold rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(completedTasks / 3) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              {/* Task Cards */}
              <div className="space-y-3">
                {/* Follow Twitter */}
                <div className={`glass-panel rounded-xl p-5 flex items-center justify-between transition-all duration-300 ${tasks.follow ? 'border-green-500/20' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#1DA1F2]/10 flex items-center justify-center flex-shrink-0">
                      {tasks.follow ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-400" />
                      ) : (
                        <svg className="w-5 h-5 text-[#1DA1F2]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold tracking-wider text-white/90">
                        {twitterVerified && !tasks.follow ? 'Follow @RealBet' : 'Follow @RealBet'}
                      </p>
                      <p className="text-xs text-brand-gold/60 font-label">+500 bonus points</p>
                      {twitterVerified && !tasks.follow && (
                        <p className="text-xs text-[#1DA1F2]/60 mt-0.5">✓ Verified — now follow to continue</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => !tasks.follow && handleTask('follow')}
                    disabled={tasks.follow || taskLoading === 'follow'}
                    className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all ${
                      tasks.follow
                        ? 'bg-green-500/20 text-green-400 cursor-default'
                        : 'bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] border border-[#1DA1F2]/20 cursor-pointer'
                    } ${taskLoading === 'follow' ? 'opacity-50' : ''}`}
                  >
                    {taskLoading === 'follow'
                      ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      : tasks.follow ? 'DONE' : 'FOLLOW'}
                  </button>
                </div>

                {/* Join Discord */}
                <div className={`glass-panel rounded-xl p-5 flex items-center justify-between transition-all duration-300 ${tasks.discord ? 'border-green-500/20' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      {tasks.discord ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-400" />
                      ) : (
                        <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold tracking-wider text-white/90">Join Discord</p>
                      <p className="text-xs text-brand-gold/60 font-label">+500 bonus points</p>
                      {discordVerified && !tasks.discord && (
                        <p className="text-xs text-purple-400/60 mt-0.5">✓ Verified — now join to continue</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => !tasks.discord && handleTask('discord')}
                    disabled={tasks.discord || taskLoading === 'discord'}
                    className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all ${
                      tasks.discord
                        ? 'bg-green-500/20 text-green-400 cursor-default'
                        : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/20 cursor-pointer'
                    } ${taskLoading === 'discord' ? 'opacity-50' : ''}`}
                  >
                    {taskLoading === 'discord'
                      ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      : tasks.discord ? 'DONE' : 'JOIN'}
                  </button>
                </div>

                {/* Connect Wallet */}
                <div className={`glass-panel rounded-xl p-5 flex items-center justify-between transition-all duration-300 ${tasks.wallet ? 'border-green-500/20' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-brand-red/10 flex items-center justify-center flex-shrink-0">
                      {tasks.wallet ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-400" />
                      ) : (
                        <svg className="w-5 h-5 text-brand-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold tracking-wider text-white/90">Connect Wallet</p>
                      <p className="text-xs text-brand-gold/60 font-label">Up to 4× multiplier</p>
                      {walletData && (
                        <p className="text-xs text-brand-gold mt-1">
                          {walletData.address} · {walletData.balance} ETH · {walletData.multiplier}x
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => !tasks.wallet && handleTask('wallet')}
                    disabled={tasks.wallet || taskLoading === 'wallet'}
                    className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all ${
                      tasks.wallet
                        ? 'bg-green-500/20 text-green-400 cursor-default'
                        : 'border border-brand-red/30 text-brand-red hover:bg-brand-red/10 cursor-pointer'
                    } ${taskLoading === 'wallet' ? 'opacity-50' : ''}`}
                  >
                    {taskLoading === 'wallet' ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : tasks.wallet ? 'DONE' : 'CONNECT'}
                  </button>
                </div>
              </div>

              {/* Wallet multiplier note */}
              <p className="text-rb-muted/30 text-[10px] font-label text-center mt-2">
                Multiplier based on wallet age + volume. Older + active wallets earn more.
              </p>

              {/* GOLD UNLOCKED badge */}
              {tasks.follow && tasks.discord && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', damping: 10 }}
                  className="mt-8 text-center"
                >
                  <div
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-gold/10 border border-brand-gold/20"
                    style={{ boxShadow: '0 0 30px rgba(246,196,74,0.08)' }}
                  >
                    <PackageIcon className="w-4 h-4 text-brand-gold" />
                    <span className="text-brand-gold text-xs font-bold font-label tracking-[0.2em]">
                      GOLD UNLOCKED
                    </span>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.section>
        )}

        {/* ═══ GOLD PRE SCREEN ═══ */}
        {subScreen === 'gold-pre' && (
          <motion.section
            key="gold-pre"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen flex flex-col items-center justify-center relative px-6 z-10"
          >
            <motion.div className="max-w-lg mx-auto text-center">
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-3"
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 glass-panel rounded-full text-brand-gold/70 text-xs font-bold font-label tracking-[0.2em]">
                  The Final Box
                </span>
              </motion.div>

              {/* Heading */}
              <h2 className="font-display text-5xl md:text-7xl font-bold mb-4 tracking-tight uppercase">
                The{' '}
                <span className="text-brand-gold">Gold Box</span>
              </h2>

              {/* Description */}
              <p className="text-rb-muted/60 text-sm mb-12">
                Your biggest reward awaits. The House saved the best for last.
              </p>

              {/* Big gold box — fixed size */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 15 }}
                whileHover={{ y: -10, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => openBox(2)}
                className="relative w-56 h-56 md:w-72 md:h-72 mx-auto rounded-2xl cursor-pointer glass-panel overflow-hidden"
                style={{
                  boxShadow: '0 0 60px rgba(246,196,74,0.1), 0 30px 60px rgba(0,0,0,0.4)',
                }}
              >
                {/* Gold gradient overlay */}
                <div
                  className="absolute inset-0 opacity-20"
                  style={{ background: BOX_GRADIENTS.gold }}
                />

                {/* Sheen sweep */}
                <div className="absolute inset-0 overflow-hidden rounded-2xl">
                  <div
                    className="absolute inset-0 animate-sheen opacity-10"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(246,196,74,0.5) 50%, transparent 100%)',
                      width: '40%',
                    }}
                  />
                </div>

                {/* Centered content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <PackageIcon className="w-16 h-16 text-brand-gold/80 mb-4" />
                  <p className="font-label text-[10px] text-brand-gold/50 tracking-widest uppercase animate-pulse">
                    Tap to open
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </motion.section>
        )}

        {/* ═══ GOLD REVEAL SCREEN ═══ */}
        {subScreen === 'gold-reveal' && (
          <motion.section
            key="gold-reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen flex flex-col items-center justify-center relative px-6 z-10"
          >
            <motion.div className="max-w-lg mx-auto text-center">
              {/* Sparkle icon */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 12 }}
                className="mb-6"
              >
                <svg className="w-14 h-14 text-brand-gold mx-auto" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l2.09 6.26L20.18 10l-4.64 3.18L17.09 20 12 16.27 6.91 20l1.55-6.82L3.82 10l6.09-1.74L12 2z" />
                  <circle cx="19" cy="5" r="1.5" fill="currentColor" opacity="0.6" />
                </svg>
              </motion.div>

              {/* Points revealed */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 12, delay: 0.1 }}
                className="mb-6"
              >
                <p className="text-6xl md:text-7xl font-bold font-label text-white mb-1">
                  +{boxes[2].points.toLocaleString()}
                </p>
                <p className="text-sm text-rb-muted/50 font-label">points</p>
              </motion.div>

              {/* Tier badge */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-3"
              >
                <span className="inline-block px-6 py-2.5 rounded-full border border-brand-gold/30 text-brand-gold font-display font-bold text-sm tracking-[0.2em] uppercase">
                  {boxes[2].tierName}
                </span>
              </motion.div>

              {/* Status locked text */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-rb-muted/50 text-sm font-label mb-8"
              >
                Your status is locked for Season 1.
              </motion.p>

              {/* Total allocation in glass panel */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="glass-panel rounded-2xl p-6 max-w-xs mx-auto mb-8"
              >
                <p className="font-label text-[10px] tracking-[0.25em] text-rb-muted/40 uppercase mb-2">
                  Total Allocation
                </p>
                <p className="text-4xl font-bold font-label tracking-tight text-white">
                  {displayTotal.toLocaleString()} <span className="text-rb-muted/40 text-base">pts</span>
                </p>
                {walletData && (
                  <p className="text-xs text-brand-gold/60 mt-2">
                    {walletData.multiplier}x wallet multiplier applied
                  </p>
                )}
              </motion.div>

              {/* Continue to VIP Card */}
              {allDone && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleContinue}
                    className="group w-full max-w-sm mx-auto py-4 px-8 rounded-xl font-display font-bold tracking-[0.15em] text-white text-sm uppercase border border-white/[0.08] overflow-hidden cursor-pointer transition-transform"
                    style={{
                      background: 'linear-gradient(180deg, #C02020 0%, #8B1414 50%, #5C0E0E 100%)',
                      boxShadow: '0 1px 0 0 rgba(255,255,255,0.08) inset, 0 -2px 6px 0 rgba(0,0,0,0.4) inset, 0 8px 40px -8px rgba(255,59,48,0.3), 0 2px 12px rgba(0,0,0,0.6)',
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-3">
                      CONTINUE TO VIP CARD
                      <svg className="w-4 h-4 opacity-60 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </span>
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
};

export default BoxesScreen;
