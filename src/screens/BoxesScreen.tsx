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
  token?: string;
  issuedAt?: number;
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

const BOX_IMAGES: Record<BoxType, string> = {
  bronze: '/Realbet Bronze.png',
  silver: '/Realbet Silver.png',
  gold: '/Realbet Gold.png',
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
  onUserProfile: (twitterId: string, username: string, pfp: string, isNewUser?: boolean) => void;
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
  const [followVerifying, setFollowVerifying] = useState<boolean>(false);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(() => {
    const gold = initialBoxes.find(b => b.type === 'gold');
    return gold?.state === 'revealed';
  });

  const { openOAuth } = useOAuthPopup();

  // Refs for each box card — used to scroll it into view after reveal
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);

  // On mount: if twitterId is already set (from saved state or mobile OAuth redirect return),
  // sync scores + Discord linkage from DB — the OAuth callback won't fire in these cases.
  useEffect(() => {
    const tid = savedAuth?.twitterId;
    if (!tid) return;
    const ac = new AbortController();
    fetch(getApiUrl(`/auth/scores/${tid}`), { signal: ac.signal })
      .then(r => r.json())
      .then(data => {
        if (!data) return;
        if (data.boxes) {
          const hasPoints = data.boxes.some((b: any) => b.points > 0);
          if (hasPoints) {
            setBoxes(data.boxes);
            saveBoxes(data.boxes);
            setSubScreen(deriveSubScreen(data.boxes));
            const goldDone = data.boxes.find((b: any) => b.type === 'gold')?.state === 'revealed';
            if (goldDone) setAllDone(true);
          }
        }
        if (data.followersCount) setFollowersCount(data.followersCount);
        if (data.discordId) {
          setDiscordVerified(true);
          setDiscordUserId(data.discordId);
          setTasks(p => ({ ...p, discord: true }));
        }
        // Infer tasks.follow from total_points vs box sum so the bonus is
        // restored correctly when loading from DB on a new device.
        if (data.boxes && data.totalPoints) {
          const boxSum = data.boxes.reduce((s: number, b: any) => s + (b.points || 0), 0);
          const refBonus = data.referralBonusPoints || 0;
          const inferredBonus = Math.max(0, data.totalPoints - boxSum - refBonus);
          const discordBonus = data.discordId ? 500 : 0;
          if ((inferredBonus - discordBonus) >= 500) setTasks(p => ({ ...p, follow: true }));
        }
      })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); });
    return () => ac.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const TASK_BONUS = 500;

  // Save scores to DB
  const saveScoresToDB = useCallback(async (currentBoxes: BoxData[], currentTasks = tasks) => {
    const tid = twitterId;
    if (!tid) return;
    const taskBonus = (currentTasks.follow ? TASK_BONUS : 0) + (currentTasks.discord ? TASK_BONUS : 0);
    const total = currentBoxes.reduce((sum, b) => sum + b.points, 0) + taskBonus;
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
          taskBonus,
          totalPoints: total,
        }),
      });
    } catch { /* non-blocking */ }
  }, [twitterId, twitterUsername, followersCount, tasks]);

  const taskBonusPoints = (tasks.follow ? TASK_BONUS : 0) + (tasks.discord ? TASK_BONUS : 0);
  const totalPoints = boxes.reduce((sum, b) => sum + b.points, 0) + taskBonusPoints;
  const displayTotal = useCountUp(totalPoints, 1000);
  const completedTasks = [tasks.follow, tasks.discord].filter(Boolean).length;

  const openBox = useCallback(async (index: number) => {
    const box = boxes[index];
    if (box.state !== 'ready') return;
    const currentTaskBonus = (tasks.follow ? TASK_BONUS : 0) + (tasks.discord ? TASK_BONUS : 0);

    // Start shake animation immediately
    setBoxes(prev => prev.map((b, i) => i === index ? { ...b, state: 'opening' } : b));

    // Roll server-side points (signed) — concurrent with animation
    let rolledPoints: number | null = null;
    let rolledTierName: string | null = null;
    let rolledToken: string | undefined;
    let rolledIssuedAt: number | undefined;

    if (twitterId) {
      try {
        const rollRes = await fetch(
          getApiUrl(`/auth/scores/roll?type=${box.type}&twitterId=${encodeURIComponent(twitterId)}&followersCount=${followersCount}&taskBonus=${currentTaskBonus}`)
        );
        if (rollRes.ok) {
          const rollData = await rollRes.json();
          rolledPoints = rollData.points;
          rolledTierName = rollData.tierName;
          rolledToken = rollData.token;
          rolledIssuedAt = rollData.issuedAt;
        }
      } catch { /* fall back to local random below */ }
    }

    // After animation completes, reveal
    setTimeout(() => {
      let points: number;
      let tierName: string;

      if (rolledPoints !== null && rolledTierName !== null) {
        // Use server-generated + signed values
        points = rolledPoints;
        tierName = rolledTierName;
      } else {
        // Fallback: local random (no token; range validation still applies on submit)
        if (box.type === 'gold') {
          const tier = getTierForFollowers(followersCount);
          const basePoints = boxes
            .filter(b => b.type !== 'gold')
            .reduce((sum, b) => sum + (b.points || 0), 0);
          const remainingGoldCap = Math.max(1, tier.maxPowerScore - basePoints - currentTaskBonus);
          const cappedMax = Math.max(1, Math.min(70_000, remainingGoldCap));
          points = randomInRange(1, cappedMax);
        } else {
          const [min, max] = BOX_POINTS[box.type];
          points = randomInRange(min, max);
        }
        tierName = pickRandom(TIER_NAMES[box.type]);
      }

      setBoxes(prev => {
        const updated = prev.map((b, i) => {
          if (i === index) return {
            ...b, state: 'revealed' as BoxState, points, tierName,
            ...(rolledToken ? { token: rolledToken, issuedAt: rolledIssuedAt } : {}),
          };
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

      // Scroll the opened box into view so the reveal is clearly visible
      setTimeout(() => {
        boxRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);

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
  }, [boxes, twitterId, followersCount, saveScoresToDB, tasks]);

  // Watch tasks state — follow is required; discord is optional bonus
  // Gold unlocks as soon as follow is done
  useEffect(() => {
    if (!tasks.follow) {
      // Keep task bonus in sync even before follow is completed.
      saveScoresToDB(boxes, tasks);
      return;
    }

    const gold = boxes.find(b => b.type === 'gold');
    if (!gold) return;

    if (gold.state === 'locked') {
      console.log('[Tasks] useEffect: follow done — unlocking gold box');
      const updated = boxes.map(b => b.type === 'gold' ? { ...b, state: 'ready' as BoxState } : b);
      setBoxes(updated);
      saveBoxes(updated);
      saveScoresToDB(updated, tasks);
      return;
    }

    // Persist updated bonus with current tasks.
    saveScoresToDB(boxes, tasks);
  }, [tasks.follow, tasks.discord, boxes, tasks, saveScoresToDB]);

  const handleTask = useCallback(async (task: 'follow' | 'discord') => {
    if (taskLoading) return;

    // ── Twitter / X ──
    if (task === 'follow') {
      if (!twitterVerified) {
        // Step 1: Authenticate with X only — follow is a separate button
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
              onUserProfile(result.user.id || '', result.user.username, pfp, result.user.isNewUser);

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
                    // Infer tasks.follow from total_points vs box sum
                    if (data.boxes && data.totalPoints) {
                      const boxSum = data.boxes.reduce((s: number, b: any) => s + (b.points || 0), 0);
                      const refBonus = data.referralBonusPoints || 0;
                      const inferredBonus = Math.max(0, data.totalPoints - boxSum - refBonus);
                      const discordBonus = data.discordId ? 500 : 0;
                      if ((inferredBonus - discordBonus) >= 500) setTasks(p => ({ ...p, follow: true }));
                    }
                  })
                  .catch(() => {});
              }
            }
          }
          setTaskLoading(null);
        });
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
        }, { gracePeriodMs: 10_000, postCloseWaitMs: 2_000 });
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

  const handleFollowClick = useCallback(() => {
    if (tasks.follow || followVerifying) return;
    const followUrl = 'https://twitter.com/intent/follow?screen_name=Realbet';
    const a = document.createElement('a');
    a.href = followUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setFollowVerifying(true);
    setTimeout(() => {
      setFollowVerifying(false);
      setTasks(p => ({ ...p, follow: true }));
    }, 8000);
  }, [tasks.follow, followVerifying]);

  const handleContinue = () => {
    const finalTier = boxes[2].tierName || boxes[1].tierName || boxes[0].tierName;
    saveScoresToDB(boxes, tasks);
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
              <div className="text-white/70 text-sm mb-6 sm:mb-10 max-w-md leading-relaxed space-y-3">
                <p>Three boxes. One score. Everything counts.</p>
                <p>Bronze and Silver are pure luck. Gold rewards your reach.</p>
                <p>
                  Your Power Score determines:<br />
                  ▸ Real bonus money<br />
                  ▸ Season 1 leaderboard rank
                </p>
                <p>Open all three. The House is keeping track.</p>
              </div>

              {/* Boxes Grid — only bronze & silver */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-10">
                {boxes.slice(0, 2).map((box, i) => (
                  <motion.div
                    key={box.type}
                    ref={el => { boxRefs.current[i] = el; }}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 + 0.2 }}
                    whileHover={box.state === 'ready' ? { y: -8, scale: 1.02 } : {}}
                    whileTap={box.state === 'ready' ? { scale: 0.97 } : {}}
                    onClick={() => box.state === 'ready' ? openBox(i) : undefined}
                    className={`relative rounded-2xl p-4 sm:p-7 text-center min-h-[220px] sm:min-h-[280px] flex flex-col items-center justify-center transition-all duration-500 backdrop-blur-md ${
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

                    {/* Box image */}
                    <div className="mb-3 sm:mb-4 relative z-[1]">
                      {box.state === 'locked' ? (
                        <div className="relative">
                          <img src={BOX_IMAGES[box.type]} alt={`${box.type} box`} className="w-36 h-36 sm:w-48 sm:h-48 object-contain opacity-30 grayscale" />
                          <LockIcon className="w-5 h-5 text-white/40 absolute bottom-0 right-0" />
                        </div>
                      ) : box.state === 'opening' ? (
                        <img src={BOX_IMAGES[box.type]} alt={`${box.type} box`} className="w-36 h-36 sm:w-48 sm:h-48 object-contain animate-bounce" />
                      ) : box.state === 'revealed' ? (
                        <motion.div
                          initial={{ scale: 0.5 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', damping: 12 }}
                        >
                          <img src={BOX_IMAGES[box.type]} alt={`${box.type} box`} className="w-36 h-36 sm:w-48 sm:h-48 object-contain" />
                        </motion.div>
                      ) : (
                        <img src={BOX_IMAGES[box.type]} alt={`${box.type} box`} className="w-36 h-36 sm:w-48 sm:h-48 object-contain" />
                      )}
                    </div>

                    {/* Label */}
                    <h3 className={`font-display text-2xl sm:text-3xl tracking-wider uppercase mb-2 relative z-[1] ${BOX_TITLE_COLORS[box.type]}`}>
                      {box.type} Box
                    </h3>

                    {/* State-specific content */}
                    {box.state === 'locked' && (
                      <div className="flex items-center gap-1.5 relative z-[1]">
                        <LockIcon className="w-4 h-4 text-white/40" />
                        <span className="font-label text-sm text-white/40 tracking-wider">
                          Open Bronze first
                        </span>
                      </div>
                    )}

                    {box.state === 'ready' && (
                      <p className="font-label text-sm text-white/50 tracking-widest uppercase animate-pulse relative z-[1]">Tap to open</p>
                    )}

                    {box.state === 'revealed' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', damping: 12 }}
                        className="relative z-[1]"
                      >
                        <p className="text-5xl sm:text-6xl font-bold font-label text-white">
                          +{box.points.toLocaleString()}
                        </p>
                        <p className="text-sm text-white/50 font-label mt-1">power score</p>
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
                      {displayTotal.toLocaleString()} <span className="text-white/50 text-base">power pts</span>
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
                <span className="text-brand-gold">Gold Mystery Box</span>
              </h2>

              {/* Description */}
              <p className="text-white/70 text-sm mb-6 sm:mb-10">
                Bigger reach. Bigger Gold. Connect and verify to unlock.
              </p>

              {/* Progress bar */}
              <div className="mb-5 sm:mb-8">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label text-[10px] tracking-wider text-white/60">Gold Mystery Box Unlock</span>
                  <span className="font-label text-[10px] tracking-wider text-white/60">
                    {tasks.follow ? '1/1 required' : '0/1 required'}
                    {tasks.discord ? ' · +Discord bonus' : ''}
                  </span>
                </div>
                <div className="h-1 bg-rb-border rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-brand-gold rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: tasks.follow ? '100%' : '0%' }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              {/* Task Cards */}
              <div className="space-y-3">
                {/* Follow Twitter */}
                <div className={`glass-panel rounded-xl p-4 sm:p-5 transition-all duration-300 ${tasks.follow ? 'border-green-500/20' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
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
                          {!twitterVerified ? 'Connect X Account' : tasks.follow ? 'Following @Realbet' : 'Connected'}
                        </p>
                        <p className="text-xs text-brand-gold/60 font-label">+500 power pts · required to unlock Gold</p>
                      </div>
                    </div>
                    {!twitterVerified ? (
                      <button
                        onClick={() => handleTask('follow')}
                        disabled={taskLoading === 'follow'}
                        className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] border border-[#1DA1F2]/20 cursor-pointer ${taskLoading === 'follow' ? 'opacity-50' : ''}`}
                      >
                        {taskLoading === 'follow'
                          ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          : 'CONNECT'}
                      </button>
                    ) : tasks.follow ? (
                      <span className="px-5 py-2 rounded-lg text-xs font-bold tracking-wider bg-green-500/20 text-green-400">DONE</span>
                    ) : (
                      <span className="px-5 py-2 rounded-lg text-xs font-bold tracking-wider bg-green-500/10 text-green-400/70 border border-green-500/20">CONNECTED ✓</span>
                    )}
                  </div>
                  {/* Follow button — shown after connect, before follow is verified */}
                  {twitterVerified && !tasks.follow && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <button
                        onClick={handleFollowClick}
                        disabled={followVerifying}
                        className={`w-full px-4 py-2.5 rounded-lg text-sm font-bold tracking-wider transition-all flex items-center justify-center gap-2 ${
                          followVerifying
                            ? 'bg-[#1DA1F2]/10 text-[#1DA1F2]/50 cursor-wait'
                            : 'bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] border border-[#1DA1F2]/20 cursor-pointer'
                        }`}
                      >
                        {followVerifying ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            Verifying follow...
                          </>
                        ) : 'FOLLOW @REALBET →'}
                      </button>
                    </div>
                  )}
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
                      <p className="text-sm font-bold tracking-wider text-white/90">Join Discord <span className="text-white/30 font-normal text-[10px] tracking-wider ml-1">(OPTIONAL)</span></p>
                      <p className="text-xs text-brand-gold/60 font-label">+500 power pts bonus</p>
                      {!twitterVerified && !tasks.discord && (
                        <p className="text-xs text-white/35 mt-0.5">Connect X first to unlock Discord</p>
                      )}
                      {discordVerified && !tasks.discord && !discordError && (
                        <p className="text-xs text-purple-400/60 mt-0.5">Connected — checking membership...</p>
                      )}
                      {discordError === 'not-member' && (
                        <div className="mt-1">
                          <p className="text-xs text-red-400/80">You're not in the server yet!</p>
                          <a
                            href="https://discord.gg/realbetio"
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
                    onClick={() => twitterVerified && !tasks.discord && handleTask('discord')}
                    disabled={!twitterVerified || tasks.discord || taskLoading === 'discord'}
                    className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all ${
                      tasks.discord
                        ? 'bg-green-500/20 text-green-400 cursor-default'
                        : !twitterVerified
                        ? 'bg-white/5 text-white/35 border border-white/10 cursor-not-allowed'
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

              {/* GOLD UNLOCKED badge + Continue button */}
              {tasks.follow && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', damping: 10 }}
                  className="mt-8 text-center space-y-4"
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
                  <button
                    onClick={() => setSubScreen('gold-pre')}
                    className="block mx-auto px-8 py-3 rounded-xl bg-brand-gold text-black text-sm font-bold font-label tracking-[0.15em] uppercase hover:bg-brand-gold/90 transition-all"
                    style={{ boxShadow: '0 0 30px rgba(246,196,74,0.15)' }}
                  >
                    CONTINUE →
                  </button>
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
                <span className="text-brand-gold">Gold Mystery Box</span>
              </h2>

              {/* Description */}
              <p className="text-white/70 text-sm mb-8 sm:mb-12">
                The House saved the heaviest hit for last.
              </p>

              {/* Big gold box — responsive size */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 15 }}
                whileHover={{ y: -10, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => openBox(2)}
                className={`relative w-64 h-64 sm:w-80 sm:h-80 md:w-[420px] md:h-[420px] mx-auto rounded-2xl cursor-pointer overflow-hidden backdrop-blur-md ${boxes[2]?.state === 'opening' ? 'animate-shake' : ''}`}
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
                  <img src={BOX_IMAGES.gold} alt="Gold box" className={`w-48 h-48 sm:w-64 sm:h-64 object-contain mb-3 sm:mb-4 drop-shadow-[0_0_20px_rgba(246,196,74,0.4)] ${boxes[2]?.state === 'opening' ? 'animate-bounce' : ''}`} />
                  <p className="font-label text-sm text-brand-gold/70 tracking-widest uppercase animate-pulse">
                    OPEN &amp; LOCK SCORE
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

              {/* Label */}
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="font-label text-[10px] tracking-[0.3em] text-brand-red/80 uppercase mb-3"
              >
                // POWER SCORE LOCKED
              </motion.p>

              {/* Points revealed */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 12, delay: 0.1 }}
                className="mb-2"
              >
                <p className="text-6xl sm:text-7xl md:text-8xl font-bold font-label text-white mb-1 tabular-nums">
                  {displayTotal.toLocaleString()}
                </p>
                <p className="text-base text-white/60 font-label tracking-widest uppercase">Power Score</p>
              </motion.div>

              {/* Divider */}
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 max-w-[200px] mx-auto my-6"
                style={{ transformOrigin: 'center' }}
              >
                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-brand-red/40" />
                <div className="w-1.5 h-1.5 bg-brand-red/60 rotate-45" />
                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-brand-red/40" />
              </motion.div>

              {/* Tagline */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
                className="text-white/50 text-sm font-label mb-8 sm:mb-10 leading-relaxed"
              >
                This is your number. This is your allocation.<br />Season 1 starts here.
              </motion.p>

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
                       SEE YOUR SEASON 1 REWARD
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
