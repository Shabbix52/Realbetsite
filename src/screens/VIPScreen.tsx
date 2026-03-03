import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserData } from '../App';
import { useCountUp } from '../hooks/useCountUp';
import { getTierForFollowers, calculateAllocationDollars, calculateRewardSplit } from '../tierConfig';
import { getApiUrl } from '../config';

/* ── Stagger animation variants ── */
const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

/* ── VIP Card Component ── */
interface VIPCardProps {
  userData: UserData;
  displayPoints: number;
}

export const VIPCard = ({ userData, displayPoints }: VIPCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const sparkles = [
    { top: '15%', left: '80%', delay: 0 },
    { top: '60%', left: '90%', delay: 0.8 },
    { top: '30%', left: '5%', delay: 1.5 },
    { top: '85%', left: '70%', delay: 2.2 },
    { top: '10%', left: '45%', delay: 0.5 },
  ];

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = ((e.clientX - centerX) / rect.width) * 12;
    const y = -((e.clientY - centerY) / rect.height) * 12;
    setTilt({ x: y, y: x });
  }, []);

  const handleMouseLeave = useCallback(() => { setTilt({ x: 0, y: 0 }); setIsHovered(false); }, []);

  return (
    <div className="mx-auto w-full max-w-2xl" style={{ perspective: '1200px' }}>
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        className="relative w-full aspect-[3/2] sm:aspect-[16/9] rounded-2xl cursor-pointer transition-transform duration-200 ease-out animate-float"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #12131A 0%, #0D0E14 50%, #07070B 100%)',
            border: '1px solid rgba(246, 196, 74, 0.2)',
            boxShadow: isHovered
              ? '0 0 60px rgba(246,196,74,0.15), 0 30px 60px rgba(0,0,0,0.6)'
              : '0 0 30px rgba(246,196,74,0.06), 0 15px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Diamond pattern overlay — bottom third only */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1/3 pointer-events-none"
            style={{
              background: `
                repeating-linear-gradient(45deg, rgba(246,196,74,0.03) 0px, rgba(246,196,74,0.03) 10px, transparent 10px, transparent 20px),
                repeating-linear-gradient(-45deg, rgba(246,196,74,0.02) 0px, rgba(246,196,74,0.02) 10px, transparent 10px, transparent 20px),
                radial-gradient(ellipse at 50% 100%, rgba(246,196,74,0.06), transparent 70%)
              `,
            }}
          />

          {/* Holographic sheen */}
          <div
            className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay"
            style={{
              background: `linear-gradient(${100 + tilt.y * 3}deg, transparent 25%, rgba(246,196,74,0.5) 45%, rgba(255,235,170,0.2) 50%, rgba(246,196,74,0.5) 55%, transparent 75%)`,
            }}
          />

          {/* Animated sheen */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            <div
              className="absolute inset-0 animate-sheen opacity-[0.06]"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(246,196,74,0.4) 50%, transparent 100%)',
                width: '40%',
                height: '100%',
              }}
            />
          </div>

          {/* Mouse-follow gold highlight */}
          <div
            className="absolute inset-0 pointer-events-none opacity-15"
            style={{
              background: `radial-gradient(circle at ${50 + tilt.y * 2}% ${45 + tilt.x * 2}%, rgba(246,196,74,0.2), transparent 50%)`,
            }}
          />

          {/* Gold sparkle dots */}
          {sparkles.map((s, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-brand-gold rounded-full animate-shimmer"
              style={{ top: s.top, left: s.left, animationDelay: `${s.delay}s`, animationDuration: `${2 + Math.random()}s` }}
            />
          ))}

          {/* Top-left: Logo */}
          <img
            src="/realbet-logo.png"
            alt="RealBet"
            className="absolute top-3 sm:top-5 left-4 sm:left-6 h-4 sm:h-5 md:h-6 object-contain pointer-events-none opacity-50"
            draggable={false}
          />

          {/* SEASON 1 label */}
          <p className="absolute top-8 sm:top-11 left-4 sm:left-6 font-label text-[7px] sm:text-[8px] tracking-[0.3em] text-white/50">
            SEASON 1
          </p>

          {/* Top-center: VIP title */}
          <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 text-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-display font-bold leading-none tracking-wider text-white">VIP</div>
            <div className="text-brand-gold text-[8px] sm:text-[10px] md:text-xs tracking-[0.4em] font-label mt-0.5">CASINO</div>
          </div>

          {/* Top-right: QR grid */}
          <div className="absolute top-3 sm:top-4 right-3 sm:right-5 w-9 h-9 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white/5 rounded border border-rb-border/50 grid grid-cols-5 grid-rows-5 gap-px p-0.5 sm:p-1">
            {Array.from({ length: 25 }, (_, i) => (
              <div key={i} className={`rounded-[1px] ${Math.random() > 0.4 ? 'bg-white/50' : 'bg-transparent'}`} />
            ))}
          </div>

          {/* Left-center: Avatar + info side by side */}
          <div className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/3 flex items-center gap-2.5 sm:gap-4 max-w-[65%]">
            <div className="relative flex-shrink-0">
              <img
                src={userData.pfp}
                alt="avatar"
                className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full border-2 border-brand-gold/60 bg-rb-card object-cover"
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#1DA1F2] flex items-center justify-center border-2 border-rb-bg">
                <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-base sm:text-lg md:text-xl font-bold text-white truncate">@{userData.username}</p>
              <p className="text-brand-gold text-xs sm:text-sm font-medium">{userData.tierName}</p>
            </div>
          </div>

          {/* Bottom-left: Points */}
          <div className="absolute bottom-3 sm:bottom-4 left-4 sm:left-6">
            <p className="text-brand-gold/60 text-[8px] sm:text-[10px] tracking-[0.2em] font-label mb-0.5">POWER POINTS</p>
            <p className="text-brand-gold text-lg sm:text-2xl md:text-3xl font-bold font-label">
              {displayPoints.toLocaleString()} power pts
            </p>
          </div>

          {/* Bottom-center: Diamond — hidden on small mobiles to prevent overlap */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-brand-gold/50 text-lg hidden sm:block">◆</div>

          {/* Bottom-right: Tagline */}
          <p className="absolute bottom-2 sm:bottom-3 right-3 sm:right-5 text-[7px] sm:text-[8px] text-white/25 italic font-label tracking-wider">
            The House remembers.
          </p>
        </div>
      </div>

      {/* Reflection — subtle, compact */}
      <div
        className="hidden sm:block w-full h-8 rounded-2xl mt-1 opacity-10 blur-sm pointer-events-none"
        style={{
          transform: 'scaleY(-1)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 100%)',
          background: 'linear-gradient(135deg, #12131A 0%, #0D0E14 50%, #07070B 100%)',
        }}
      />
    </div>
  );
};

/* ── Lock Icon ── */
const LockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/* ═══════════════════════════════════════════ */

interface VIPScreenProps {
  userData: UserData;
  onLeaderboard?: () => void;
  onLogout?: () => void;
}

const VIPScreen = ({ userData, onLeaderboard, onLogout }: VIPScreenProps) => {
  // Persist share state per twitterId so it survives refreshes/re-logins
  const sharedKey = userData.twitterId ? `realbet_shared_${userData.twitterId}` : null;
  const [shared, setShared] = useState(() => {
    if (!sharedKey) return false;
    try { return localStorage.getItem(sharedKey) === '1'; } catch { return false; }
  });

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrlInput, setShareUrlInput] = useState('');
  const [shareUrlError, setShareUrlError] = useState('');

  // ── Referral state ──
  const [referralCode, setReferralCode] = useState<string>('');
  const [referralCount, setReferralCount] = useState(0);
  const [referralBonusPoints, setReferralBonusPoints] = useState(0);
  const [referralMaxBonus, setReferralMaxBonus] = useState(25000);
  const [referralBonusPerRef, setReferralBonusPerRef] = useState(250);
  const [referralReferredBonus, setReferralReferredBonus] = useState(150);
  const [referrals, setReferrals] = useState<{ username: string; bonus: number; status: string; totalPoints: number }[]>([]);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState(() => {
    try {
      return localStorage.getItem('realbet_referral_code') || '';
    } catch { return ''; }
  });
  const [referralApplying, setReferralApplying] = useState(false);
  const [referralApplyResult, setReferralApplyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [referredBy, setReferredBy] = useState<string | null>(null);
  const [showReferralDetails, setShowReferralDetails] = useState(false);

  // Load referral data + restore share state from DB
  useEffect(() => {
    if (!userData.twitterId) return;
    // Restore hasShared from server (cross-device)
    fetch(getApiUrl(`/auth/scores/${userData.twitterId}`))
      .then(r => r.json())
      .then(data => {
        if (data?.hasShared && !shared) {
          setShared(true);
          if (sharedKey) { try { localStorage.setItem(sharedKey, '1'); } catch { /* ignore */ } }
        }
      })
      .catch(() => {});
    setReferralLoading(true);
    fetch(getApiUrl(`/auth/referral/${userData.twitterId}`))
      .then(r => r.json())
      .then(data => {
        if (data.referralCode) setReferralCode(data.referralCode);
        setReferralCount(data.referralCount || 0);
        setReferralBonusPoints(data.referralBonusPoints || 0);
        setReferralMaxBonus(data.maxBonus || 25000);
        setReferralBonusPerRef(data.bonusPerReferral || 250);
        setReferralReferredBonus(data.referredBonus || 150);
        setReferrals(data.referrals || []);
        setReferredBy(data.referredBy || null);

        // Auto-apply referral code from URL if user is new and hasn't been referred yet
        if (!data.referredBy && referralCodeInput.trim() && userData.isNewUser) {
          autoApplyReferral(referralCodeInput.trim());
        }
      })
      .catch(() => {})
      .finally(() => setReferralLoading(false));
  }, [userData.twitterId]);

  // Auto-apply a referral code (silent, from URL capture)
  const autoApplyReferral = useCallback(async (code: string) => {
    if (!userData.twitterId || !code) return;
    setReferralApplying(true);
    try {
      const res = await fetch(getApiUrl('/auth/referral/apply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitterId: userData.twitterId,
          referralCode: code,
          username: userData.username,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReferralApplyResult({ success: true, message: `+${data.referredBonus} bonus pts from @${data.referrerUsername}!` });
        setReferredBy(data.referrerUsername);
        setReferralCodeInput('');
        try { localStorage.removeItem('realbet_referral_code'); } catch { /* ignore */ }
      }
    } catch { /* silent fail for auto-apply */ }
    setReferralApplying(false);
  }, [userData.twitterId, userData.username]);

  const handleCopyReferral = useCallback(() => {
    const link = `${window.location.origin}?ref=${referralCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    });
  }, [referralCode]);

  const handleApplyReferral = useCallback(async () => {
    if (!referralCodeInput.trim() || referralApplying) return;
    setReferralApplying(true);
    setReferralApplyResult(null);
    try {
      const res = await fetch(getApiUrl('/auth/referral/apply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitterId: userData.twitterId,
          referralCode: referralCodeInput.trim(),
          username: userData.username,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReferralApplyResult({ success: true, message: `+${data.referredBonus} bonus pts from @${data.referrerUsername}!` });
        setReferredBy(data.referrerUsername);
        try { localStorage.removeItem('realbet_referral_code'); } catch { /* ignore */ }
      } else {
        setReferralApplyResult({ success: false, message: data.error || 'Failed to apply code' });
      }
    } catch {
      setReferralApplyResult({ success: false, message: 'Network error — try again' });
    }
    setReferralApplying(false);
  }, [referralCodeInput, referralApplying, userData.twitterId, userData.username]);

  // Spec calculations
  const powerScore = userData.totalPoints;
  const tier = getTierForFollowers(userData.followersCount);
  const allocationDollars = calculateAllocationDollars(powerScore);
  const split = calculateRewardSplit(powerScore, tier);
  const displayPoints = useCountUp(powerScore, 1200);

  const handleShare = () => {
    const text = encodeURIComponent(
      `SEASON 1 ALLOCATION $${allocationDollars.toLocaleString()}\n\n${powerScore.toLocaleString()} Power Points\n\n@RealBet | The House is open.\n\n#RealBetSeason1`,
    );
    // Open tweet window
    const a = document.createElement('a');
    a.href = `https://twitter.com/intent/tweet?text=${text}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Show modal to collect post URL after a short delay
    setTimeout(() => setShowShareModal(true), 1500);
  };

  const handleShareConfirm = async () => {
    const url = shareUrlInput.trim();
    // Must be a full tweet URL: https://x.com/username/status/1234567890
    const tweetUrlRegex = /^https?:\/\/(twitter|x)\.com\/[A-Za-z0-9_]{1,50}\/status\/[0-9]{5,25}(\?.*)?$/;
    if (url && !tweetUrlRegex.test(url)) {
      setShareUrlError('Please enter a valid post URL, e.g. https://x.com/yourname/status/...');
      return;
    }
    setShareUrlError('');
    // Persist locally
    if (sharedKey) {
      try { localStorage.setItem(sharedKey, '1'); } catch { /* ignore */ }
    }
    // Save to backend
    if (userData.twitterId) {
      fetch(getApiUrl('/auth/share'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twitterId: userData.twitterId, postUrl: url || null }),
      }).catch(() => {});
    }
    setShowShareModal(false);
    setShared(true);
  };

  const handleClaim = () => {
    window.open('https://realbet.io', '_blank');
  };

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center relative px-4 sm:px-6 z-10"
    >

      {/* Share confirmation modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            key="share-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) { setShowShareModal(false); setShared(true); if (sharedKey) { try { localStorage.setItem(sharedKey, '1'); } catch {} } } }}
          >
            <motion.div
              key="share-modal"
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-md glass-panel rounded-2xl p-6 space-y-5 border border-rb-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-white font-bold text-lg font-display tracking-wide">Nice post! 🎉</h3>
                  <p className="text-rb-muted/60 text-sm mt-1">Paste your X post link below so we can verify it. This is optional — you can skip if you prefer.</p>
                </div>
                <button
                  onClick={() => { setShowShareModal(false); setShared(true); if (sharedKey) { try { localStorage.setItem(sharedKey, '1'); } catch {} } }}
                  className="text-rb-muted/40 hover:text-white transition-colors flex-shrink-0 mt-0.5"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="space-y-2">
                <input
                  type="url"
                  value={shareUrlInput}
                  onChange={(e) => { setShareUrlInput(e.target.value); setShareUrlError(''); }}
                  placeholder="https://x.com/yourname/status/..."
                  className="w-full px-4 py-3 rounded-xl border border-rb-border text-sm font-label focus:outline-none focus:border-[#1DA1F2]/50"
                  style={{ color: '#000', backgroundColor: '#e5e5e5' }}
                  autoFocus
                />
                {shareUrlError && <p className="text-brand-red text-xs font-label">{shareUrlError}</p>}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowShareModal(false); setShared(true); if (sharedKey) { try { localStorage.setItem(sharedKey, '1'); } catch {} } }}
                  className="flex-1 py-3 rounded-xl border border-rb-border text-rb-muted/50 text-sm font-bold tracking-wider hover:text-white hover:border-rb-border/70 transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  SKIP
                </button>
                <button
                  onClick={handleShareConfirm}
                  className="flex-1 py-3 rounded-xl bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] border border-[#1DA1F2]/30 text-sm font-bold tracking-wider transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  CONFIRM
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Logout button — top-right corner */}
      {onLogout && (
        <div className="w-full max-w-4xl mx-auto flex justify-end pt-4 sm:pt-6">
          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded-lg bg-rb-border/30 text-rb-muted/50 text-xs font-bold font-label tracking-wider hover:bg-rb-border/50 hover:text-white transition-colors"
          >
            LOG OUT
          </button>
        </div>
      )}

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="w-full max-w-4xl mx-auto py-4 sm:py-8 pb-24 sm:pb-16"
      >
        {/* ── Big Allocation Headline ── */}
        <motion.div variants={itemVariants} className="text-center mb-4 sm:mb-8">
          <h2 className="font-display text-xl sm:text-3xl md:text-5xl font-bold tracking-tight uppercase mb-1 sm:mb-2">
            Season 1{' '}
            <span className="text-brand-red">Allocation</span>
          </h2>
          <motion.p
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
            className="text-3xl sm:text-5xl md:text-7xl font-bold font-label text-white mt-1 sm:mt-2"
            style={{ textShadow: '0 0 60px rgba(255,255,255,0.1)' }}
          >
            ${allocationDollars.toLocaleString()}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-brand-gold text-sm sm:text-lg md:text-xl font-bold font-label mt-1 sm:mt-2"
          >
            {displayPoints.toLocaleString()} Power Points
          </motion.p>
        </motion.div>

        {/* ── Two-column layout ── */}
        <div className="flex flex-col lg:flex-row gap-5 sm:gap-8 items-start">
          {/* ═══ Left Column: VIP Card + Share + Referral ═══ */}
          <motion.div variants={itemVariants} className="flex-1 w-full space-y-3 sm:space-y-4">
            <VIPCard userData={userData} displayPoints={displayPoints} />

            {/* Share on X button */}
            <button
              onClick={handleShare}
              disabled={shared}
              style={{ touchAction: 'manipulation' }}
              className={`w-full flex items-center justify-center gap-2 sm:gap-2.5 py-4 rounded-xl font-bold text-xs sm:text-sm tracking-wider transition-all duration-300 active:scale-[0.98] ${
                shared
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] border border-[#1DA1F2]/20'
              }`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {shared ? 'SHARED ✓' : 'SHARE ON X'}
            </button>
          </motion.div>

          {/* ═══ Right Column: Referral + Season 1 Allocation ═══ */}
          <motion.div variants={itemVariants} className="flex-1 w-full lg:max-w-sm lg:mx-0 space-y-4 sm:space-y-5">
            {/* ── REFERRAL SYSTEM ── */}
            <div className="glass-panel rounded-2xl p-4 sm:p-6 space-y-3 sm:space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/90">Refer Friends</p>
                    <p className="text-[10px] text-white/50 font-label">Earn {referralBonusPerRef} power pts per referral</p>
                  </div>
                </div>
                {referralCount > 0 && (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 font-label tracking-wider font-bold">
                    {referralCount} REFERRED
                  </span>
                )}
              </div>

              {/* Referral stats bar */}
              {referralCode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-label tracking-wider text-white/40">
                    <span>BONUS EARNED</span>
                    <span>{referralBonusPoints.toLocaleString()} / {referralMaxBonus.toLocaleString()} power pts</span>
                  </div>
                  <div className="h-1.5 bg-rb-border/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'linear-gradient(90deg, #a855f7, #6366f1)' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((referralBonusPoints / referralMaxBonus) * 100, 100)}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                    />
                  </div>
                </div>
              )}

              {/* Referral link */}
              {referralCode && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 rounded-lg bg-rb-card border border-rb-border text-[11px] sm:text-xs font-label text-white/60 overflow-hidden">
                    <span className="sm:hidden">{window.location.hostname}?ref={referralCode}</span>
                    <span className="hidden sm:inline truncate block">{window.location.origin}?ref={referralCode}</span>
                  </div>
                  <button
                    onClick={handleCopyReferral}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold font-label tracking-wider transition-all flex-shrink-0 ${
                      referralCopied
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/20'
                    }`}
                  >
                    {referralCopied ? '✓ COPIED' : 'COPY'}
                  </button>
                </div>
              )}

              {/* Share referral on X */}
              {referralCode && (
                <button
                  onClick={() => {
                    const refLink = `${window.location.origin}?ref=${referralCode}`;
                    const text = encodeURIComponent(
                      `Join me on @RealBet Season 1! Use my referral link for bonus points 🎰\n\n${refLink}\n\n#RealBetSeason1`
                    );
                    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'width=550,height=420');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] text-xs font-bold font-label tracking-wider border border-[#1DA1F2]/10 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  SHARE REFERRAL ON X
                </button>
              )}

              {referredBy && (
                <p className="text-[10px] text-green-400/60 font-label tracking-wider">
                  ✓ Referred by @{referredBy} — +{referralReferredBonus} power pts
                </p>
              )}

              {/* Referred users list (expandable) */}
              {referralCount > 0 && (
                <div>
                  <button
                    onClick={() => setShowReferralDetails(!showReferralDetails)}
                    className="flex items-center gap-1.5 text-[10px] text-white/40 font-label tracking-wider hover:text-white/60 transition-colors"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${showReferralDetails ? 'rotate-90' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                    VIEW YOUR REFERRALS ({referralCount})
                  </button>
                  <AnimatePresence>
                    {showReferralDetails && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 space-y-1.5">
                          {referrals.map((ref, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-rb-border/20">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs text-white/60 font-label truncate">@{ref.username}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-label tracking-wider ${
                                  ref.status === 'converted' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  {ref.status === 'converted' ? 'ACTIVE' : 'PENDING'}
                                </span>
                              </div>
                              <span className="text-xs text-purple-400 font-label font-bold">+{ref.bonus}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Loading state */}
              {referralLoading && !referralCode && (
                <div className="flex items-center justify-center py-2">
                  <svg className="w-5 h-5 animate-spin text-purple-400/50" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              )}
            </div>

            {/* ── Season 1 Allocation ── */}
            <div className="glass-panel rounded-2xl p-5 sm:p-8 space-y-5 sm:space-y-6">
              {/* Section heading */}
              <p className="font-label text-[10px] tracking-[0.3em] text-white/50 uppercase">
                // SEASON 1 ALLOCATION
              </p>

              {/* Power Score */}
              <div>
                <motion.p
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
                  className="text-4xl sm:text-5xl font-bold font-label text-white"
                  style={{ textShadow: '0 0 40px rgba(255,255,255,0.08)' }}
                >
                  {displayPoints.toLocaleString()}
                </motion.p>
                <p className="text-white/50 text-sm font-label tracking-wider mt-1">Power Score</p>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-rb-border/40 to-transparent" />

              {/* Split explanation */}
              <div className="space-y-2">
                <p className="text-white/60 text-sm">Your Power Score is split into:</p>
                <div className="space-y-1.5 pl-1">
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 text-xs">•</span>
                    <span className="text-white/80 text-sm font-medium">60% Play Credit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-brand-gold text-xs">•</span>
                    <span className="text-white/80 text-sm font-medium">40% Season 1 REAL Points</span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-rb-border/40 to-transparent" />

              {/* Breakdown */}
              <div className="space-y-3">
                <p className="font-label text-[10px] tracking-[0.2em] text-white/50 uppercase">Breakdown</p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-400 text-sm">🎰</span>
                    </div>
                    <span className="text-white/80 text-sm">Play Credit</span>
                  </div>
                  <span className="text-green-400 text-lg font-bold font-label">
                    ${split.freePlay.dollars.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-gold/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-gold text-sm">⭐</span>
                    </div>
                    <span className="text-white/80 text-sm">Season 1 REAL Points</span>
                  </div>
                  <span className="text-brand-gold text-lg font-bold font-label">
                    {split.realPoints.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-rb-border/40 to-transparent" />

              {/* Claim button */}
              <button
                onClick={handleClaim}
                style={{
                  touchAction: 'manipulation',
                  background: 'linear-gradient(to bottom, rgba(255,59,48,0.9), #8B1A1A)',
                }}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-xs sm:text-sm tracking-[0.15em] uppercase transition-all duration-300 active:scale-[0.98] border border-brand-red/40 text-[#F0F1F7] shadow-[0_0_50px_rgba(255,59,48,0.15)] hover:shadow-[0_0_80px_rgba(255,59,48,0.3)]"
              >
                CLAIM YOUR SEASON 1 REWARD
              </button>

              {/* Tier note */}
              <p className="text-white/30 text-[10px] font-label text-center">
                {tier.label} tier • {split.freePlay.wager}x playthrough on Play Credit
              </p>
            </div>

            {/* Leaderboard link */}
            {onLeaderboard && (
              <button
                onClick={onLeaderboard}
                style={{ touchAction: 'manipulation' }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand-gold/10 hover:bg-brand-gold/20 active:scale-[0.98] text-brand-gold text-sm font-bold font-label tracking-wider border border-brand-gold/10 transition-all mt-4"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 21h8m-4-4v4M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                  <path d="M9 9h.01M15 9h.01" />
                </svg>
                VIEW LEADERBOARD
              </button>
            )}

            {/* Tagline */}
            <p className="text-center text-white/20 text-xs italic pt-4">
              See you at the tables.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </motion.section>
  );
};

export default VIPScreen;
