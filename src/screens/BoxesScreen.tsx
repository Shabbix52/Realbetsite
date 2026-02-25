import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserData } from '../App';
import { useCountUp } from '../hooks/useCountUp';
import { useOAuthPopup } from '../hooks/useOAuthPopup';
import { getApiUrl } from '../config';
import { getTierForFollowers } from '../tierConfig';

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
  bronze: [100, 500],
  silver: [500, 1100],
  gold: [0, 0], // Gold is deterministic per follower tier — see getTierForFollowers
};

const BOX_TITLE_COLORS: Record<BoxType, string> = {
  bronze: 'text-[#C8956C]',
  silver: 'text-[#9CA0A8]',
  gold: 'text-[#F6C34A]',
};

const BOX_BORDER_COLORS: Record<BoxType, string> = {
  bronze: 'rgba(200,149,108,0.5)',
  silver: 'rgba(156,160,168,0.5)',
  gold: 'rgba(246,195,74,0.5)',
};

const BOX_GLOW_COLORS: Record<BoxType, string> = {
  bronze: 'rgba(200,149,108,0.18)',
  silver: 'rgba(156,160,168,0.15)',
  gold: 'rgba(246,195,74,0.22)',
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

const STORAGE_KEY = 'realbet_box_results';
const AUTH_STATE_KEY = 'realbet_auth_state';

interface SavedAuthState {
  twitterVerified: boolean;
  twitterId: string | null;
  twitterUsername: string | null;
  followersCount: number;
  discordVerified: boolean;
  discordUserId: string | null;
  tasks: { follow: boolean; discord: boolean };
}

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

function loadAuthState(): SavedAuthState | null {
  try {
    const saved = localStorage.getItem(AUTH_STATE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch { return null; }
}

function saveAuthState(state: SavedAuthState) {
  try {
    localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

interface BoxesScreenProps {
  userData: UserData;
  onComplete: (points: number, tierName: string, followersCount: number) => void;
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
  const [savedAuth] = useState(() => loadAuthState());
  const [twitterId, setTwitterId] = useState<string | null>(() => savedAuth?.twitterId ?? null);
  const [twitterUsername, setTwitterUsername] = useState<string | null>(() => savedAuth?.twitterUsername ?? null);
  const [followersCount, setFollowersCount] = useState<number>(() => savedAuth?.followersCount ?? 0);
  const [boxes, setBoxes] = useState<BoxData[]>(initialBoxes);

  const [tasks, setTasks] = useState(() => savedAuth?.tasks ?? {
    follow: false,
    discord: false,
  });
  const [twitterVerified, setTwitterVerified] = useState(() => savedAuth?.twitterVerified ?? false);
  const [discordVerified, setDiscordVerified] = useState(() => savedAuth?.discordVerified ?? false);
  const [discordUserId, setDiscordUserId] = useState<string | null>(() => savedAuth?.discordUserId ?? null);
  const [taskLoading, setTaskLoading] = useState<string | null>(null);
  const [followCountdown, setFollowCountdown] = useState<number>(0);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(() => {
    const gold = initialBoxes.find(b => b.type === 'gold');
    return gold?.state === 'revealed';
  });

  const { openOAuth } = useOAuthPopup();

  // Persist auth state to localStorage whenever it changes
  useEffect(() => {
    saveAuthState({
      twitterVerified,
      twitterId,
      twitterUsername,
      followersCount,
      discordVerified,
      discordUserId,
      tasks,
    });
  }, [twitterVerified, twitterId, twitterUsername, followersCount, discordVerified, discordUserId, tasks]);

  // Save scores to DB
  const saveScoresToDB = useCallback(async (currentBoxes: BoxData[]) => {
    const tid = twitterId;
    if (!tid) return;
    const total = currentBoxes.reduce((sum, b) => sum + b.points, 0);
    try {
      await fetch(getApiUrl('/auth/scores'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitterId: tid,
          username: twitterUsername,
          followersCount,
          boxes: currentBoxes,
          walletMultiplier: 1,
          totalPoints: total,
        }),
      });
    } catch { /* non-blocking */ }
  }, [twitterId, twitterUsername, followersCount]);

  const totalPoints = boxes.reduce((sum, b) => sum + b.points, 0);
  const displayTotal = useCountUp(totalPoints, 1000);
  const completedTasks = [tasks.follow, tasks.discord].filter(Boolean).length;

  const openBox = useCallback((index: number) => {
    const box = boxes[index];
    if (box.state !== 'ready') return;

    // Set to opening
    setBoxes(prev => prev.map((b, i) => i === index ? { ...b, state: 'opening' } : b));

    // After shake animation, reveal
    setTimeout(() => {
      let points: number;
      if (box.type === 'gold') {
        // Gold: deterministic from follower tier table
        const tier = getTierForFollowers(followersCount);
        points = tier.goldPoints;
      } else {
        // Bronze/Silver: random within spec range
        const [min, max] = BOX_POINTS[box.type];
        points = randomInRange(min, max);
      }
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

  // Watch tasks state — when both are done, unlock gold and navigate
  useEffect(() => {
    if (!tasks.follow || !tasks.discord) return;
    setBoxes(prev => {
      const gold = prev.find(b => b.type === 'gold');
      if (!gold || gold.state === 'ready' || gold.state === 'revealed') return prev;
      console.log('[Tasks] useEffect: both tasks done — unlocking gold box');
      return prev.map(b => b.type === 'gold' ? { ...b, state: 'ready' as BoxState } : b);
    });
    setSubScreen(prev => {
      if (prev === 'tasks') {
        console.log('[Tasks] useEffect: navigating to gold-pre');
        return 'gold-pre';
      }
      return prev;
    });
  }, [tasks.follow, tasks.discord]);

  const handleTask = useCallback(async (task: 'follow' | 'discord') => {
    if (taskLoading) return;

    // ── Twitter / X ──
    if (task === 'follow') {
      if (!twitterVerified) {
        // Step 1: Authenticate with X
        setTaskLoading('follow');
        openOAuth('twitter', (result) => {
          console.log('[Tasks] Twitter OAuth result:', result.success, result.user?.username, result.error);
          if (result.success) {
            setTwitterVerified(true);
            if (result.user?.id) setTwitterId(result.user.id);
            if (result.user?.followersCount !== undefined) setFollowersCount(result.user.followersCount);
            if (result.user?.username) {
              setTwitterUsername(result.user.username);
              const pfp = result.user.avatar
                ? result.user.avatar.replace('_normal', '_400x400')
                : `https://api.dicebear.com/7.x/avataaars/svg?seed=${result.user.username}`;
              onUserProfile(result.user.id || '', result.user.username, pfp);

              // Load existing scores + Discord linkage from DB
              if (result.user.id) {
                fetch(getApiUrl(`/auth/scores/${result.user.id}`))
                  .then(r => r.json())
                  .then(data => {
                    if (!data) return;

                    // Restore boxes
                    if (data.boxes) {
                      const hasPoints = data.boxes.some((b: any) => b.points > 0);
                      if (hasPoints) {
                        setBoxes(data.boxes);
                        saveBoxes(data.boxes);
                        // Derive correct screen from loaded boxes
                        const derived = deriveSubScreen(data.boxes);
                        setSubScreen(derived);
                        // If gold was already revealed, mark journey as done
                        const goldDone = data.boxes.find((b: any) => b.type === 'gold')?.state === 'revealed';
                        if (goldDone) setAllDone(true);
                      }
                    }

                    // Restore followers count
                    if (data.followersCount) setFollowersCount(data.followersCount);

                    // Restore Discord linkage if previously connected
                    if (data.discordId) {
                      setDiscordVerified(true);
                      setDiscordUserId(data.discordId);
                      setTasks(p => ({ ...p, discord: true }));
                    }
                  })
                  .catch(() => {});
              }
            }
            // After OAuth success: DON'T mark done yet. Open follow intent + countdown.
          }
          setTaskLoading(null);
        });
      } else if (!tasks.follow) {
        // Already verified — Step 2: Open follow intent and start countdown
        const targetUsername = 'Realbet'; // matches TWITTER_TARGET_USERNAME
        window.open(`https://twitter.com/intent/follow?screen_name=${targetUsername}`, '_blank');
        setFollowCountdown(10);
        const countdownTimer = setInterval(() => {
          setFollowCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownTimer);
              setTasks(p => ({ ...p, follow: true }));
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
      return;
    }

    // ── Discord ──
    if (task === 'discord') {
      setDiscordError(null);
      if (!discordVerified) {
        // Step 1: Authenticate with Discord
        setTaskLoading('discord');
        openOAuth('discord', async (result) => {
          console.log('[Tasks] Discord OAuth result:', result.success, result.user?.username, result.error);
          if (result.success && result.user?.id) {
            setDiscordVerified(true);
            setDiscordUserId(result.user.id);

            // Persist the Discord ↔ Twitter link in the database
            if (twitterId) {
              fetch(getApiUrl('/auth/discord/link'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  twitterId,
                  discordId: result.user.id,
                  discordUsername: result.user.username || result.user.globalName || null,
                }),
              }).catch(() => {});
            }

            // Step 2: Check if user is actually in the Discord server
            try {
              const memberRes = await fetch(getApiUrl(`/auth/discord/check-member/${result.user.id}`));
              const memberData = await memberRes.json();
              console.log('[Tasks] Discord membership check:', memberData);
              if (memberData.member) {
                setTasks(p => ({ ...p, discord: true }));
              } else {
                setDiscordError('not-member');
              }
            } catch {
              setDiscordError('check-failed');
            }
          }
          setTaskLoading(null);
        });
      } else if (!tasks.discord && discordUserId) {
        // Already verified — re-check membership
        setTaskLoading('discord');
        try {
          const memberRes = await fetch(getApiUrl(`/auth/discord/check-member/${discordUserId}`));
          const memberData = await memberRes.json();
          console.log('[Tasks] Discord membership re-check:', memberData);
          if (memberData.member) {
            setDiscordError(null);
            setTasks(p => ({ ...p, discord: true }));
          } else {
            setDiscordError('not-member');
          }
        } catch {
          setDiscordError('check-failed');
        }
        setTaskLoading(null);
      }
      return;
    }
  }, [taskLoading, twitterVerified, discordVerified, tasks, twitterId, openOAuth, discordUserId, onUserProfile]);

  const handleContinue = () => {
    const finalTier = boxes[2].tierName || boxes[1].tierName || boxes[0].tierName;
    saveScoresToDB(boxes);
    onComplete(totalPoints, finalTier, followersCount);
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
        onComplete(total, finalTier, followersCount);
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
      <AnimatePresence mode="wait">
        {/* ═══ BOXES SCREEN ═══ */}
        {subScreen === 'boxes' && (
          <motion.section
            key="boxes"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
            className="min-h-screen flex flex-col items-center justify-center relative px-4 sm:px-6 z-10 overflow-y-auto py-16 sm:py-0"
          >
            <motion.div className="w-full max-w-3xl mx-auto">
              {/* Label */}
              <p className="font-label text-[10px] tracking-[0.25em] text-white/50 mb-2 sm:mb-3">
                // LOOT DROP
              </p>

              {/* Heading */}
              <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold mb-2 sm:mb-3 tracking-tight uppercase">
                Mystery{' '}
                <span className="text-brand-red">Boxes</span>
              </h2>

              {/* Description */}
              <p className="text-white/70 text-sm mb-6 sm:mb-10 max-w-md">
                Each box reveals points. Points convert to Season 1 credit.
              </p>

              {/* Boxes Grid — only bronze & silver */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-10">
                {boxes.slice(0, 2).map((box, i) => (
                  <motion.div
                    key={box.type}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 + 0.2 }}
                    whileHover={box.state === 'ready' ? { y: -8, scale: 1.02 } : {}}
                    whileTap={box.state === 'ready' ? { scale: 0.97 } : {}}
                    onClick={() => box.state === 'ready' ? openBox(i) : undefined}
                    className={`relative rounded-2xl p-5 sm:p-8 text-center min-h-[180px] sm:min-h-[240px] flex flex-col items-center justify-center transition-all duration-500 backdrop-blur-md ${
                      box.state === 'ready'
                        ? 'cursor-pointer'
                        : box.state === 'locked'
                        ? 'cursor-not-allowed opacity-50'
                        : ''
                    } ${box.state === 'opening' ? 'animate-shake' : ''}`}
                    style={{
                      background: 'rgba(10,11,15,0.75)',
                      border: `1px solid ${box.state === 'locked' ? 'rgba(51,56,64,0.4)' : BOX_BORDER_COLORS[box.type]}`,
                      boxShadow: box.state === 'ready' || box.state === 'revealed'
                        ? `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${BOX_GLOW_COLORS[box.type]}, inset 0 1px 0 rgba(255,255,255,0.04)`
                        : '0 8px 24px rgba(0,0,0,0.3)',
                    }}
                  >
                    {/* Color overlay */}
                    <div
                      className="absolute inset-0 rounded-2xl"
                      style={{ background: BOX_GRADIENTS[box.type], opacity: box.state === 'locked' ? 0.06 : 0.18 }}
                    />

                    {/* Flash overlay for opening */}
                    {box.state === 'opening' && (
                      <div className="absolute inset-0 rounded-2xl bg-white animate-box-flash z-10 pointer-events-none" />
                    )}

                    {/* Icon */}
                    <div className="mb-3 sm:mb-4 relative z-[1]">
                      {box.state === 'locked' ? (
                        <LockIcon className="w-10 h-10 sm:w-12 sm:h-12 text-white/40" />
                      ) : box.state === 'opening' ? (
                        <PackageIcon className="w-10 h-10 sm:w-12 sm:h-12 text-white animate-bounce" />
                      ) : box.state === 'revealed' ? (
                        <motion.div
                          initial={{ scale: 0.5 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', damping: 12 }}
                        >
                          <PackageIcon className="w-8 h-8 sm:w-10 sm:h-10 text-white/50" />
                        </motion.div>
                      ) : (
                        <PackageIcon className="w-10 h-10 sm:w-12 sm:h-12 text-white/70" />
                      )}
                    </div>

                    {/* Label */}
                    <h3 className={`font-display text-lg tracking-wider uppercase mb-1 relative z-[1] ${BOX_TITLE_COLORS[box.type]}`}>
                      {box.type} Box
                    </h3>

                    {/* State-specific content */}
                    {box.state === 'locked' && (
                      <div className="flex items-center gap-1.5 relative z-[1]">
                        <LockIcon className="w-3 h-3 text-white/40" />
                        <span className="font-label text-[10px] text-white/40 tracking-wider">
                          Open Bronze first
                        </span>
                      </div>
                    )}

                    {box.state === 'ready' && (
                      <p className="font-label text-[10px] text-white/50 tracking-widest uppercase animate-pulse relative z-[1]">Tap to open</p>
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
                        <p className="text-xs text-white/50 font-label">points</p>
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
                    <p className="font-label text-[10px] tracking-[0.25em] text-white/50 uppercase mb-1">
                      Current Total
                    </p>
                    <p className="text-3xl font-bold font-label tracking-tight text-white">
                      {displayTotal.toLocaleString()} <span className="text-white/50 text-base">pts</span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Unlocking next phase message after silver */}
              {boxes[1].state === 'revealed' && subScreen === 'boxes' && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-white/50 text-xs font-label tracking-wider mt-6"
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
            className="min-h-screen flex flex-col items-center justify-center relative px-4 sm:px-6 z-10 overflow-y-auto py-16 sm:py-0"
          >
            <motion.div className="w-full max-w-lg mx-auto">
              {/* Label */}
              <p className="font-label text-[10px] tracking-[0.25em] text-white/50 mb-2 sm:mb-3">
                // THE FINAL BOX
              </p>

              {/* Heading */}
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-2 sm:mb-3 tracking-tight uppercase">
                Unlock{' '}
                <span className="text-brand-gold">Gold Box</span>
              </h2>

              {/* Description */}
              <p className="text-white/70 text-sm mb-6 sm:mb-10">
                Complete these steps to unlock your biggest reward.
              </p>

              {/* Progress bar */}
              <div className="mb-5 sm:mb-8">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label text-[10px] tracking-wider text-white/60">Gold Box Unlock</span>
                  <span className="font-label text-[10px] tracking-wider text-white/60">{completedTasks}/2 completed</span>
                </div>
                <div className="h-1 bg-rb-border rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-brand-gold rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(completedTasks / 2) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              {/* Task Cards */}
              <div className="space-y-3">
                {/* Follow Twitter */}
                <div className={`glass-panel rounded-xl p-4 sm:p-5 flex items-center justify-between gap-3 transition-all duration-300 ${tasks.follow ? 'border-green-500/20' : ''}`}>
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
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
                        {!twitterVerified ? 'Connect & Follow @RealBet' : 'Follow @RealBet'}
                      </p>
                      <p className="text-xs text-brand-gold/60 font-label">+500 bonus points</p>
                      {twitterVerified && !tasks.follow && followCountdown === 0 && (
                        <p className="text-xs text-[#1DA1F2]/60 mt-0.5">Connected — tap Follow to continue</p>
                      )}
                      {followCountdown > 0 && (
                        <p className="text-xs text-[#1DA1F2]/60 mt-0.5">Verifying... {followCountdown}s</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => !tasks.follow && followCountdown === 0 && handleTask('follow')}
                    disabled={tasks.follow || taskLoading === 'follow' || followCountdown > 0}
                    className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all ${
                      tasks.follow
                        ? 'bg-green-500/20 text-green-400 cursor-default'
                        : followCountdown > 0
                        ? 'bg-[#1DA1F2]/10 text-[#1DA1F2]/50 cursor-wait'
                        : 'bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] border border-[#1DA1F2]/20 cursor-pointer'
                    } ${taskLoading === 'follow' ? 'opacity-50' : ''}`}
                  >
                    {taskLoading === 'follow'
                      ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      : tasks.follow ? 'DONE'
                      : followCountdown > 0 ? `${followCountdown}s`
                      : twitterVerified ? 'FOLLOW'
                      : 'CONNECT'}
                  </button>
                </div>

                {/* Join Discord */}
                <div className={`glass-panel rounded-xl p-4 sm:p-5 flex items-center justify-between gap-3 transition-all duration-300 ${tasks.discord ? 'border-green-500/20' : discordError ? 'border-red-500/20' : ''}`}>
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
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
                      {discordVerified && !tasks.discord && !discordError && (
                        <p className="text-xs text-purple-400/60 mt-0.5">Connected — checking membership...</p>
                      )}
                      {discordError === 'not-member' && (
                        <div className="mt-1">
                          <p className="text-xs text-red-400/80">You're not in the server yet!</p>
                          <a
                            href="https://discord.gg/realbet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-400 underline hover:text-purple-300"
                          >
                            Join the Discord server →
                          </a>
                        </div>
                      )}
                      {discordError === 'check-failed' && (
                        <p className="text-xs text-red-400/80 mt-0.5">Check failed — try again</p>
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
                      : tasks.discord ? 'DONE'
                      : discordError === 'not-member' ? 'VERIFY'
                      : discordVerified ? 'VERIFY'
                      : 'CONNECT'}
                  </button>
                </div>
              </div>

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
            className="min-h-screen flex flex-col items-center justify-center relative px-4 sm:px-6 z-10 overflow-y-auto py-16 sm:py-0"
          >
            <motion.div className="max-w-lg mx-auto text-center">
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-2 sm:mb-3"
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 glass-panel rounded-full text-brand-gold/70 text-xs font-bold font-label tracking-[0.2em]">
                  The Final Box
                </span>
              </motion.div>

              {/* Heading */}
              <h2 className="font-display text-4xl sm:text-5xl md:text-7xl font-bold mb-3 sm:mb-4 tracking-tight uppercase">
                The{' '}
                <span className="text-brand-gold">Gold Box</span>
              </h2>

              {/* Description */}
              <p className="text-white/70 text-sm mb-8 sm:mb-12">
                Your biggest reward awaits. The House saved the best for last.
              </p>

              {/* Big gold box — responsive size */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 15 }}
                whileHover={{ y: -10, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => openBox(2)}
                className="relative w-44 h-44 sm:w-56 sm:h-56 md:w-72 md:h-72 mx-auto rounded-2xl cursor-pointer overflow-hidden backdrop-blur-md"
                style={{
                  background: 'rgba(10,11,15,0.75)',
                  border: '1px solid rgba(246,195,74,0.55)',
                  boxShadow: '0 0 80px rgba(246,196,74,0.25), 0 30px 60px rgba(0,0,0,0.4)',
                }}
              >
                {/* Gold gradient overlay */}
                <div
                  className="absolute inset-0 opacity-[0.28]"
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

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <PackageIcon className="w-12 h-12 sm:w-16 sm:h-16 text-brand-gold/80 mb-3 sm:mb-4" />
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
            className="min-h-screen flex flex-col items-center justify-center relative px-4 sm:px-6 z-10 overflow-y-auto py-16 sm:py-0"
          >
            <motion.div className="max-w-lg mx-auto text-center">

              {/* Points revealed */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 12, delay: 0.1 }}
                className="mb-4 sm:mb-6"
              >
                <p className="text-5xl sm:text-6xl md:text-7xl font-bold font-label text-white mb-1">
                  +{boxes[2].points.toLocaleString()}
                </p>
                <p className="text-sm text-white/60 font-label">points</p>
              </motion.div>

              {/* (Removed sparkle icon and tier badge per UI request) */}

              {/* Status locked text */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-white/60 text-sm font-label mb-5 sm:mb-8"
              >
                Your status is locked for Season 1.
              </motion.p>

              {/* Total allocation in glass panel */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="glass-panel rounded-2xl p-5 sm:p-6 max-w-xs mx-auto mb-6 sm:mb-8"
              >
                <p className="font-label text-[10px] tracking-[0.25em] text-white/50 uppercase mb-2">
                  Total Allocation
                </p>
                <p className="text-3xl sm:text-4xl font-bold font-label tracking-tight text-white">
                  {displayTotal.toLocaleString()} <span className="text-white/50 text-base">pts</span>
                </p>
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
                    className="group w-full max-w-sm mx-auto py-3.5 sm:py-4 px-6 sm:px-8 rounded-xl font-display font-bold tracking-[0.15em] text-white text-xs sm:text-sm uppercase border border-white/[0.08] overflow-hidden cursor-pointer transition-transform"
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
