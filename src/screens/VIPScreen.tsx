import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserData } from '../App';
import { useCountUp } from '../hooks/useCountUp';
import { getTierForFollowers, calculateAllocationDollars, calculateRewardSplit } from '../tierConfig';
import { getApiUrl } from '../config';

const HUB_CONNECT_URL = import.meta.env.VITE_HUB_CONNECT_URL || 'https://hub.realbet.io/connect';

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

/* ── Floating VIP embers (deterministic — no Math.random in render) ── */
const VIP_EMBERS = [
  { delay: 0, x: 12, size: 2.5, hue: 358, yFactor: 0.45, xDrift: 30, dur: 7 },
  { delay: 0.9, x: 28, size: 3.2, hue: 362, yFactor: 0.55, xDrift: -25, dur: 8.5 },
  { delay: 1.7, x: 45, size: 2, hue: 355, yFactor: 0.6, xDrift: 40, dur: 6.5 },
  { delay: 2.5, x: 62, size: 3.5, hue: 370, yFactor: 0.5, xDrift: -35, dur: 9 },
  { delay: 3.3, x: 78, size: 2.8, hue: 360, yFactor: 0.65, xDrift: 20, dur: 7.5 },
  { delay: 4.1, x: 88, size: 2.2, hue: 356, yFactor: 0.4, xDrift: -45, dur: 8 },
  { delay: 5.0, x: 20, size: 3, hue: 365, yFactor: 0.55, xDrift: 35, dur: 7.8 },
  { delay: 5.8, x: 52, size: 2.6, hue: 358, yFactor: 0.7, xDrift: -30, dur: 6.8 },
  { delay: 6.6, x: 70, size: 3.3, hue: 372, yFactor: 0.48, xDrift: 25, dur: 9.2 },
  { delay: 7.4, x: 35, size: 2.3, hue: 355, yFactor: 0.58, xDrift: -40, dur: 7.2 },
];

const VIPEmber = ({ delay, x, size, hue, yFactor, xDrift, dur }: (typeof VIP_EMBERS)[0]) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      width: size,
      height: size,
      left: `${x}%`,
      bottom: '-5%',
      background: `radial-gradient(circle, hsl(${hue} 90% 55% / 0.9), transparent)`,
      filter: size < 3 ? 'none' : 'blur(1px)',
    }}
    initial={{ y: 0, opacity: 0, scale: 0 }}
    animate={{
      y: [0, -(typeof window !== 'undefined' ? window.innerHeight : 800) * yFactor],
      x: [0, xDrift],
      opacity: [0, 0.6, 0.6, 0],
      scale: [0, 1, 1, 0.3],
    }}
    transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeOut' }}
  />
);

/* ── Scan line ── */
const VIPScanLine = ({ top, delay }: { top: string; delay: number }) => (
  <motion.div
    className="absolute left-0 w-full pointer-events-none z-[2]"
    style={{ top, height: '1px' }}
    initial={{ scaleX: 0, opacity: 0 }}
    animate={{ scaleX: 1, opacity: [0, 0.2, 0] }}
    transition={{ duration: 3, delay, repeat: Infinity, repeatDelay: 10, ease: 'easeInOut' }}
  >
    <div className="w-full h-full bg-gradient-to-r from-transparent via-brand-red/30 to-transparent" />
  </motion.div>
);

/* ── Red diamond divider ── */
const RedDivider = () => (
  <div className="flex items-center gap-3 my-1">
    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-red/30 to-transparent" />
    <div className="w-1.5 h-1.5 bg-brand-red/50 rotate-45" />
    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-red/30 to-transparent" />
  </div>
);

/* ── VIP Card Component ── */
interface VIPCardProps {
  userData: UserData;
  displayPoints: number;
  freePlayDollars: number;
  realPoints: number;
}

export interface VIPCardHandle {
  captureImage: () => Promise<string | null>;
}

export const VIPCard = forwardRef<VIPCardHandle, VIPCardProps>(({ userData, displayPoints, freePlayDollars, realPoints }, ref) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    captureImage: async () => {
      if (!cardRef.current) return null;
      try {
        // Reset tilt/animations before capture
        const el = cardRef.current;
        const prevTransform = el.style.transform;
        el.style.transform = 'none';
        const canvas = await html2canvas(el, {
          backgroundColor: '#0a0b0f',
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
        });
        el.style.transform = prevTransform;
        return canvas.toDataURL('image/png');
      } catch (err) {
        console.error('Card capture failed:', err);
        return null;
      }
    },
  }));
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = ((e.clientX - centerX) / rect.width) * 10;
    const y = -((e.clientY - centerY) / rect.height) * 10;
    setTilt({ x: y, y: x });
  }, []);

  const handleMouseLeave = useCallback(() => { setTilt({ x: 0, y: 0 }); setIsHovered(false); }, []);

  /*
   * Layout percentages based on 912×588 actual image:
   *   Avatar:       167.7×170.8  @ (112.3, 131.6)  → left 12.31%  top 22.38%  w 18.39%  h 29.05%
   *   Username:     375×68.8     @ (322.2, 217.1)   → left 35.33%  top 36.92%  w 41.12%  h 11.70%
   *   Play Credit:  259.7×68.8   @ (101.8, 392.6)   → left 11.16%  top 66.77%  w 28.48%  h 11.70%
   *   Real Points:  259.7×68.8   @ (421.5, 392.6)   → left 46.22%  top 66.77%  w 28.48%  h 11.70%
   */

  return (
    <div className="mx-auto w-full" style={{ perspective: '1200px' }}>
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        className="relative w-full rounded-2xl cursor-pointer transition-transform duration-200 ease-out animate-float"
        style={{
          aspectRatio: '912 / 588',
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden"
          style={{
            boxShadow: isHovered
              ? '0 0 60px rgba(191,18,32,0.15), 0 30px 60px rgba(0,0,0,0.6)'
              : '0 0 30px rgba(191,18,32,0.06), 0 15px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Card template image */}
          <img
            src="/VIPcard.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover rounded-2xl pointer-events-none select-none"
            draggable={false}
          />

          {/* Holographic sheen on hover */}
          <div
            className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay rounded-2xl"
            style={{
              background: `linear-gradient(${100 + tilt.y * 3}deg, transparent 25%, rgba(255,255,255,0.3) 45%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.3) 55%, transparent 75%)`,
            }}
          />

          {/* Animated sheen sweep */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            <div
              className="absolute inset-0 animate-sheen opacity-[0.05]"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                width: '40%',
                height: '100%',
              }}
            />
          </div>

          {/* Mouse-follow highlight */}
          <div
            className="absolute inset-0 pointer-events-none opacity-10 rounded-2xl"
            style={{
              background: `radial-gradient(circle at ${50 + tilt.y * 2}% ${45 + tilt.x * 2}%, rgba(255,255,255,0.15), transparent 50%)`,
            }}
          />

          {/* ── Avatar ── */}
          <div
            className="absolute rounded-2xl overflow-hidden bg-black"
            style={{ left: '12.31%', top: '22.38%', width: '18.39%', height: '29.05%' }}
          >
            <img
              src={userData.pfp}
              alt="avatar"
              className="w-full h-full object-cover"
            />
          </div>

          {/* ── Username ── */}
          <div
            className="absolute flex items-center"
            style={{ left: '35.33%', top: '36.92%', width: '41.12%', height: '11.70%' }}
          >
            <p className="text-white font-bold font-label truncate w-full" style={{ fontSize: 'clamp(0.65rem, 2.6cqi, 1.3rem)' }}>
              @{userData.username}
            </p>
          </div>

          {/* ── Play Credit (bottom-left stat) ── */}
          <div
            className="absolute flex flex-col justify-center"
            style={{ left: '11.16%', top: '66.77%', width: '28.48%', height: '11.70%' }}
          >
            <p className="font-display font-bold leading-none" style={{ fontSize: 'clamp(1.0rem, 4.5cqi, 2.4rem)', color: '#C9A84C', textShadow: '0 0 12px rgba(201,168,76,0.7), 0 2px 4px rgba(0,0,0,0.8)' }}>
              ${freePlayDollars.toLocaleString()}
            </p>
          </div>

          {/* ── Real Points (bottom-right stat) ── */}
          <div
            className="absolute flex flex-col justify-center"
            style={{ left: '55%', top: '66.77%', width: '28.48%', height: '11.70%' }}
          >
            <p className="font-display font-bold leading-none" style={{ fontSize: 'clamp(1.0rem, 4.5cqi, 2.4rem)', color: '#C9A84C', textShadow: '0 0 12px rgba(201,168,76,0.7), 0 2px 4px rgba(0,0,0,0.8)' }}>
              {realPoints.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
VIPCard.displayName = 'VIPCard';

/* ── Lock Icon ── */
const LockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/* ── Rainbow Border Box (animated gradient border) ── */
const RainbowBox = ({ children }: { children: React.ReactNode }) => (
  <>
    <style>{`@keyframes borderFlash{0%{background-position:0% 50%}100%{background-position:300% 50%}}`}</style>
    <div className="relative p-[2px] rounded-2xl" style={{ background: 'linear-gradient(90deg,#ff3c3c,#ffd700,#00ff88,#1d9bf0,#ff3cff,#ff3c3c)', backgroundSize: '300% 100%', animation: 'borderFlash 3s linear infinite' }}>
      <div className="rounded-[10px] overflow-hidden bg-[#111118]">{children}</div>
    </div>
  </>
);

/* ═══════════════════════════════════════════ */

interface VIPScreenProps {
  userData: UserData;
  onLeaderboard?: () => void;
  onLogout?: () => void;
  onUpdatePoints?: (totalPoints: number, followersCount: number) => void;
}

const VIPScreen = ({ userData, onLeaderboard, onLogout, onUpdatePoints }: VIPScreenProps) => {
  const vipCardRef = useRef<VIPCardHandle>(null);

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

  // ── Claim state ──
  const [claimStatus, setClaimStatus] = useState<'idle' | 'linking' | 'claiming' | 'claimed' | 'error'>('idle');
  const [accountLinked, setAccountLinked] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState<number | null>(null);
  const [claimError, setClaimError] = useState('');

  // ── Referral state ──
  const [referralCode, setReferralCode] = useState<string>('');
  const [referralCount, setReferralCount] = useState(0);
  const [referralBonusPoints, setReferralBonusPoints] = useState(0);
  const [referralBonusPerRef, setReferralBonusPerRef] = useState(5);
  const [referralReferredBonus, setReferralReferredBonus] = useState(0);
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

  // Load referral data + restore share state from DB + sync authoritative totalPoints
  useEffect(() => {
    if (!userData.twitterId) return;
    // Fetch scores — this is the single source of truth for totalPoints
    fetch(getApiUrl(`/auth/scores/${userData.twitterId}`))
      .then(r => r.json())
      .then(data => {
        if (!data) return;
        // Sync authoritative totalPoints from DB (includes referral bonuses, task bonuses, etc.)
        if (typeof data.totalPoints === 'number' && data.totalPoints > 0 && data.totalPoints !== userData.totalPoints) {
          onUpdatePoints?.(data.totalPoints, data.followersCount ?? userData.followersCount);
        }
        if (data.hasShared && !shared) {
          setShared(true);
          if (sharedKey) { try { localStorage.setItem(sharedKey, '1'); } catch { /* ignore */ } }
        }
        // Restore claim status
        if (data.claimedAt) {
          setClaimStatus('claimed');
          setClaimedAmount(data.claimAmount || null);
          setAccountLinked(true);
        } else if (data.accountLinked) {
          setAccountLinked(true);
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
        setReferralBonusPerRef(data.bonusPerReferral ?? 5);
        setReferralReferredBonus(data.referredBonus ?? 0);
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

  const [shareLoading, setShareLoading] = useState(false);

  const handleShare = async () => {
    if (shareLoading) return;
    setShareLoading(true);

    // Build the share URL (will be replaced with OG URL after upload)
    let shareLink = `${import.meta.env.VITE_CLIENT_URL || window.location.origin}`;
    if (referralCode) shareLink += `?ref=${referralCode}`;

    try {
      // Capture the VIP card as a screenshot
      const imageBase64 = await vipCardRef.current?.captureImage();
      if (imageBase64 && userData.twitterId) {
        // Upload to server
        const res = await fetch(getApiUrl('/auth/share-image'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ twitterId: userData.twitterId, imageBase64 }),
        });
        const data = await res.json();
        if (data.shareUrl) {
          // Use the OG share page URL so Twitter unfurls the card image
          shareLink = data.shareUrl;
          if (referralCode) shareLink += `?ref=${referralCode}`;
        }
      }
    } catch (err) {
      console.error('Share image upload failed:', err);
      // Fall through — still open tweet with text only
    }

    const text = encodeURIComponent(
      `SEASON 1 ALLOCATION $${allocationDollars.toLocaleString()}\n\n${powerScore.toLocaleString()} Power Score\n\n@RealBet | The House is open.\n\n${shareLink}\n\n#RealBetSeason1`,
    );
    // Open tweet window
    const a = document.createElement('a');
    a.href = `https://twitter.com/intent/tweet?text=${text}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShareLoading(false);
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

  const handleClaim = async () => {
    if (claimStatus === 'claimed' || claimStatus === 'claiming' || claimStatus === 'linking') return;
    setClaimError('');

    // Check claim result from localStorage (set by App.tsx on return from hub)
    const claimResult = localStorage.getItem('realbet_claim_result');
    if (claimResult) {
      localStorage.removeItem('realbet_claim_result');
      if (claimResult === 'success') {
        setClaimStatus('claimed');
        setClaimedAmount(allocationDollars);
        setAccountLinked(true);
        return;
      } else if (claimResult === 'already_claimed') {
        setClaimStatus('claimed');
        setAccountLinked(true);
        return;
      } else {
        setClaimError('Something went wrong linking your account. Try again.');
        return;
      }
    }

    // If already linked but not claimed: call direct claim endpoint
    if (accountLinked) {
      setClaimStatus('claiming');
      try {
        const res = await fetch(getApiUrl('/auth/claim'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ twitterId: userData.twitterId }),
        });
        const data = await res.json();
        if (res.ok && (data.success || data.alreadyClaimed)) {
          setClaimStatus('claimed');
          setClaimedAmount(data.amount || allocationDollars);
        } else {
          setClaimError(data.error || 'Failed to claim reward');
          setClaimStatus('error');
        }
      } catch {
        setClaimError('Network error — try again');
        setClaimStatus('error');
      }
      return;
    }

    // Not linked yet: redirect through server so it builds the correct return_url
    setClaimStatus('linking');
    const serverUrl = import.meta.env.VITE_API_URL || window.location.origin;
    window.location.href = `${serverUrl}/auth/hub-connect?uid=${encodeURIComponent(userData.twitterId)}&twitter_handle=${encodeURIComponent(userData.username)}`;
  };

  // On mount, check if we returned from hub connect
  useEffect(() => {
    const result = localStorage.getItem('realbet_claim_result');
    if (result) {
      handleClaim(); // Will process the stored result
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center relative px-4 sm:px-6 z-10 overflow-hidden"
    >
      {/* ── Atmospheric effects (matching HeroScreen) ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-[1]">
        {VIP_EMBERS.map((e, i) => (
          <VIPEmber key={i} {...e} />
        ))}
      </div>
      <VIPScanLine top="22%" delay={3} />
      <VIPScanLine top="58%" delay={8} />
      <VIPScanLine top="82%" delay={14} />
      <motion.div
        className="absolute inset-0 pointer-events-none z-[1]"
        animate={{ opacity: [0, 0.15, 0] }}
        transition={{ duration: 6, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 20%, hsl(355 83% 41% / 0.12), transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-[3]"
        style={{ background: 'linear-gradient(to top, hsl(240 18% 2% / 0.9), transparent)' }}
      />

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
        <div className="w-full max-w-6xl mx-auto flex justify-end pt-4 sm:pt-6">
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
        className="w-full max-w-5xl mx-auto py-4 sm:py-8 pb-24 sm:pb-16"
      >
        {/* ── Big Allocation Headline ── */}
        <motion.div variants={itemVariants} className="text-center mb-6 sm:mb-10">
          {/* Badge line */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 'auto' }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden inline-flex items-center gap-3 mb-3"
          >
            <motion.span
              className="inline-block w-8 h-px bg-brand-red/60"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              style={{ transformOrigin: 'left' }}
            />
            <span className="font-mono text-[10px] sm:text-xs tracking-[0.3em] text-rb-muted uppercase whitespace-nowrap">
              Season 1{' '}
              <span className="text-brand-red">Allocation</span>
            </span>
            <motion.span
              className="inline-block w-8 h-px bg-brand-red/60"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              style={{ transformOrigin: 'right' }}
            />
          </motion.div>

          <h2
            className="font-headline text-3xl sm:text-5xl md:text-7xl font-bold tracking-wider uppercase mb-2 sm:mb-3 text-[#F2F2F2]"
            style={{ textShadow: '0 0 60px hsl(355 83% 41% / 0.3), 0 4px 12px hsl(0 0% 0% / 0.8)' }}
          >
            Season 1{' '}
            <span className="text-brand-red">Allocation</span>
          </h2>

          {/* Red diamond divider */}
          <motion.div
            className="flex items-center gap-3 max-w-xs mx-auto mt-4 sm:mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-red/40 to-transparent" />
            <div className="w-2 h-2 bg-brand-red/60 rotate-45" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-brand-red/40 to-transparent" />
          </motion.div>
        </motion.div>

        {/* ── Two-column layout ── */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ═══ Left Column: VIP Card + Share button ═══ */}
          <motion.div variants={itemVariants} className="flex-1 w-full space-y-3">
            <VIPCard ref={vipCardRef} userData={userData} displayPoints={displayPoints} freePlayDollars={split.freePlay.dollars} realPoints={split.realPoints} />

            {/* Share on X to Activate */}
            <button
              onClick={handleShare}
              disabled={shareLoading || (shared && claimStatus !== 'claimed')}
              style={{ touchAction: 'manipulation', boxShadow: shared ? undefined : '0 4px 20px rgba(29,155,240,0.3)' }}
              className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-sm tracking-widest transition-all active:scale-[0.98] ${
                shared
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : shareLoading
                    ? 'bg-[#1DA1F2]/70 text-white cursor-wait'
                    : 'bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white'
              }`}
            >
              {shareLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                  </svg>
                  CAPTURING CARD...
                </>
              ) : shared ? (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  SHARED ON X ✓
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  SHARE ON X TO ACTIVATE
                </>
              )}
            </button>
            {!shared && (
              <p className="text-center text-rb-muted/35 text-xs font-mono tracking-wider">
                Share your VIP card to unlock Season 1 rewards
              </p>
            )}
          </motion.div>

          {/* ═══ Right Column: Referral + Allocation ═══ */}
          <motion.div variants={itemVariants} className="flex-1 min-w-0 w-full space-y-4">
            {/* ── REFERRAL SYSTEM ── */}
            <RainbowBox>
            <div className="p-5 space-y-4">
              {/* Header */}
              <div>
                <p className="font-display font-bold text-xl text-rb-muted tracking-wider uppercase">Refer Friends</p>
                <p className="text-sm text-rb-muted/50 font-mono mt-1">
                  Earn <span className="text-brand-gold font-semibold">{referralBonusPerRef} Power Score</span> per referral
                  {referralCount > 0 && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 font-label tracking-wider">{referralCount} REFERRED</span>}
                </p>
              </div>

              {/* Referral stats bar */}
              {referralCode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-label tracking-wider text-white/40">
                    <span>BONUS EARNED</span>
                    <span>{referralBonusPoints.toLocaleString()} power pts</span>
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
            </RainbowBox>

            {/* ── Allocation: Pre-share or Post-share ── */}
            <AnimatePresence mode="wait">
              {!shared && claimStatus !== 'claimed' ? (
                /* PRE-SHARE STATE */
                <motion.div
                  key="pre-share"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35 }}
                  className="glass-panel rounded-2xl p-6 space-y-4"
                >
                  <p className="text-sm text-rb-muted/60 font-mono leading-relaxed text-center">
                    Your allocation is ready. Share your <span className="text-brand-red font-semibold">VIP card</span> on X to activate your <span className="text-brand-red font-semibold">Season 1</span> rewards.
                  </p>
                  <button
                    onClick={handleShare}
                    disabled={shareLoading}
                    style={{ touchAction: 'manipulation', boxShadow: '0 4px 20px rgba(29,155,240,0.3)' }}
                    className="w-full py-4 rounded-xl bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white font-bold text-sm font-label tracking-wider transition-all flex items-center justify-center gap-2.5 disabled:opacity-60"
                  >
                    {shareLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" />
                        </svg>
                        CAPTURING CARD...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        SHARE ON X
                      </>
                    )}
                  </button>
                  <div className="w-full py-4 rounded-xl border border-brand-red/10 bg-brand-red/[0.03] text-rb-muted/30 text-sm font-bold font-display tracking-[0.15em] flex items-center justify-center gap-2 cursor-not-allowed select-none">
                    <LockIcon className="w-4 h-4" />
                    CLAIM REWARDS
                  </div>
                </motion.div>
              ) : (
                /* POST-SHARE STATE */
                <motion.div
                  key="post-share"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35 }}
                  className="glass-panel rounded-2xl p-5 sm:p-6 space-y-5 border-brand-red/10"
                  style={{ boxShadow: '0 0 40px rgba(191, 18, 32, 0.08), inset 0 0 40px rgba(191, 18, 32, 0.03)' }}
                >
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="inline-block w-6 h-px bg-brand-red/60" />
                      <p className="font-mono text-[10px] tracking-[0.3em] text-rb-muted/50 uppercase">Season 1 Allocation</p>
                    </div>
                    <motion.p
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
                      className="text-4xl sm:text-5xl font-bold font-display text-rb-muted tracking-wider"
                      style={{ textShadow: '0 0 40px hsl(355 83% 41% / 0.25), 0 4px 12px hsl(0 0% 0% / 0.8)' }}
                    >
                      {displayPoints.toLocaleString()}
                    </motion.p>
                    <p className="text-rb-muted/50 text-sm font-mono tracking-wider mt-1">Power Score</p>
                  </div>

                  {/* 60/40 split cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-brand-red/[0.06] border border-brand-red/[0.12] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold font-display text-brand-red">60%</p>
                      <p className="text-[10px] text-rb-muted/50 uppercase tracking-wider mt-1 font-label">Play Credit</p>
                    </div>
                    <div className="bg-brand-red/[0.06] border border-brand-red/[0.12] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold font-display text-brand-red">40%</p>
                      <p className="text-[10px] text-rb-muted/50 uppercase tracking-wider mt-1 font-label">Season 1 REAL Points</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-red/30 to-transparent" />
                    <div className="w-1.5 h-1.5 bg-brand-red/50 rotate-45" />
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-red/30 to-transparent" />
                  </div>

                  {/* Breakdown */}
                  <div>
                    <p className="font-label text-[10px] tracking-[0.3em] text-rb-muted/40 uppercase mb-3">Breakdown</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rotate-45 bg-brand-red flex-shrink-0" />
                          <span className="text-sm text-rb-muted/70 font-mono">Play Credit</span>
                        </div>
                        <span className="text-lg font-bold font-display text-rb-muted tracking-wider">${split.freePlay.dollars.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rotate-45 bg-brand-red flex-shrink-0" />
                          <span className="text-sm text-rb-muted/70 font-mono">Season 1 REAL Points</span>
                        </div>
                        <span className="text-lg font-bold font-display text-rb-muted tracking-wider">{split.realPoints.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-red/30 to-transparent" />
                    <div className="w-1.5 h-1.5 bg-brand-red/50 rotate-45" />
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-red/30 to-transparent" />
                  </div>

                  {/* Claim button */}
                  <div className="relative space-y-2">
                    {claimStatus === 'claimed' ? (
                      <div className="w-full py-4 rounded-xl bg-green-500/15 border border-green-500/30 text-center">
                        <p className="text-green-400 text-sm font-bold font-display tracking-[0.15em]">✓ REWARD CLAIMED</p>
                        {claimedAmount !== null && (
                          <p className="text-green-400/60 text-xs font-mono mt-1">
                            {claimedAmount.toLocaleString()} REAL Points credited to your account
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <motion.div
                          className="absolute -inset-3 rounded-xl pointer-events-none"
                          animate={{ opacity: [0, 0.4, 0] }}
                          transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
                          style={{ background: 'radial-gradient(ellipse at center, rgba(212,168,50,0.15), transparent 70%)', filter: 'blur(12px)' }}
                        />
                        <motion.button
                          onClick={handleClaim}
                          disabled={claimStatus === 'claiming' || claimStatus === 'linking'}
                          className={`w-full py-4 rounded-xl font-bold text-sm font-display tracking-[0.15em] transition-all flex items-center justify-center gap-2 relative overflow-hidden ${
                            (claimStatus === 'claiming' || claimStatus === 'linking') ? 'opacity-70 cursor-wait' : ''
                          }`}
                          style={{ background: 'linear-gradient(135deg, #d4a832, #ffd700)', color: '#000', boxShadow: '0 4px 24px rgba(212,168,50,0.3)', touchAction: 'manipulation' }}
                          whileHover={claimStatus === 'idle' || claimStatus === 'error' ? { scale: 1.02, boxShadow: '0 6px 34px rgba(212,168,50,0.5)' } : {}}
                          whileTap={claimStatus === 'idle' || claimStatus === 'error' ? { scale: 0.97 } : {}}
                        >
                          <AnimatePresence mode="wait">
                            {claimStatus === 'linking' ? (
                              <motion.span key="linking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2">
                                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full" />
                                CONNECTING TO CASINO...
                              </motion.span>
                            ) : claimStatus === 'claiming' ? (
                              <motion.span key="claiming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2">
                                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full" />
                                CLAIMING REWARD...
                              </motion.span>
                            ) : (
                              <motion.span key="claim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                {accountLinked ? 'CLAIM YOUR SEASON 1 REWARD →' : 'LINK CASINO & CLAIM REWARD →'}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      </>
                    )}
                    {claimError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-brand-red text-xs font-label text-center"
                      >
                        {claimError}
                      </motion.p>
                    )}
                  </div>

                  <p className="text-rb-muted/30 text-[10px] font-mono text-center tracking-wider">
                    {tier.label} tier • {split.freePlay.wager}x playthrough on Play Credit
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Leaderboard link */}
            {onLeaderboard && (
              <button
                onClick={onLeaderboard}
                style={{ touchAction: 'manipulation' }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand-red/10 hover:bg-brand-red/20 active:scale-[0.98] text-brand-red text-sm font-bold font-display tracking-[0.15em] border border-brand-red/15 transition-all mt-4"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 21h8m-4-4v4M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                  <path d="M9 9h.01M15 9h.01" />
                </svg>
                VIEW LEADERBOARD
              </button>
            )}

            {/* Tagline */}
            <p className="text-center text-rb-muted/25 text-xs font-mono tracking-[0.3em] uppercase pt-4">
              The House has spoken.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </motion.section>
  );
};

export default VIPScreen;
