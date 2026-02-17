import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { UserData } from '../App';
import { useCountUp } from '../hooks/useCountUp';

function calculateCreditValue(points: number): number {
  return Math.round(points / 10);
}

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
        className="relative w-full aspect-[16/9] rounded-2xl cursor-pointer transition-transform duration-200 ease-out animate-float"
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
            className="absolute top-5 left-6 h-5 md:h-6 object-contain pointer-events-none opacity-50"
            draggable={false}
          />

          {/* SEASON 1 label */}
          <p className="absolute top-11 left-6 font-label text-[8px] tracking-[0.3em] text-rb-muted/40">
            SEASON 1
          </p>

          {/* Top-center: VIP title */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center">
            <div className="text-4xl md:text-5xl font-display font-bold leading-none tracking-wider text-white">VIP</div>
            <div className="text-brand-gold text-[10px] md:text-xs tracking-[0.4em] font-label mt-0.5">CASINO</div>
          </div>

          {/* Top-right: QR grid */}
          <div className="absolute top-4 right-5 w-12 h-12 md:w-14 md:h-14 bg-white/5 rounded border border-rb-border/50 grid grid-cols-5 grid-rows-5 gap-px p-1">
            {Array.from({ length: 25 }, (_, i) => (
              <div key={i} className={`rounded-[1px] ${Math.random() > 0.4 ? 'bg-white/50' : 'bg-transparent'}`} />
            ))}
          </div>

          {/* Left-center: Avatar + info side by side */}
          <div className="absolute left-6 top-1/2 -translate-y-1/3 flex items-center gap-4">
            <div className="relative">
              <img
                src={userData.pfp}
                alt="avatar"
                className="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-brand-gold/60 bg-rb-card object-cover"
              />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#1DA1F2] flex items-center justify-center border-2 border-rb-bg">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-white">@{userData.username}</p>
              <p className="text-brand-gold text-sm font-medium">{userData.tierName}</p>
            </div>
          </div>

          {/* Bottom-left: Points */}
          <div className="absolute bottom-4 left-6">
            <p className="text-brand-gold/60 text-[10px] tracking-[0.2em] font-label mb-0.5">BONUS POINTS</p>
            <p className="text-brand-gold text-2xl md:text-3xl font-bold font-label">
              {displayPoints.toLocaleString()} pts
            </p>
          </div>

          {/* Bottom-center: Diamond */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-brand-gold/50 text-lg">◆</div>

          {/* Bottom-right: Tagline */}
          <p className="absolute bottom-3 right-5 text-[8px] text-rb-muted/20 italic font-label tracking-wider">
            The House remembers.
          </p>
        </div>
      </div>

      {/* Reflection */}
      <div
        className="w-full aspect-[16/9] rounded-2xl mt-1 opacity-10 blur-sm pointer-events-none"
        style={{
          transform: 'scaleY(-1)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 50%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 50%)',
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
}

const VIPScreen = ({ userData }: VIPScreenProps) => {
  const [shared, setShared] = useState(false);

  const creditValue = calculateCreditValue(userData.totalPoints);
  const displayPoints = useCountUp(userData.totalPoints, 1200);

  const handleShare = () => {
    const text = encodeURIComponent(
      `I just earned my @RealBet Season 1 VIP Card\n\n${userData.totalPoints.toLocaleString()} pts locked.\n\nThe House is open.\n\n#RealBetSeason1`,
    );
    window.open(
      `https://twitter.com/intent/tweet?text=${text}`,
      'twitter-share',
      'width=550,height=420',
    );

    setTimeout(() => {
      setShared(true);
    }, 2000);
  };

  const handleClaim = () => {
    window.open('https://realbet.io', '_blank');
  };

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-screen flex flex-col items-center relative px-6 z-10 overflow-y-auto"
    >
      {/* Step indicator */}
      <div className="fixed top-4 right-4 z-50">
        <span className="font-label text-[10px] tracking-[0.15em] text-rb-muted/40">
          Step 6/7 • Rewards
        </span>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="w-full max-w-4xl mx-auto py-8"
      >
        {/* ── Heading (above both columns) ── */}
        <motion.div variants={itemVariants} className="text-center mb-10">
          <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight uppercase mb-3 text-center">
            Claim Your{' '}
            <span className="text-brand-red">Rewards</span>
          </h2>
          <p className="text-rb-muted/60 text-sm mb-10 text-center">
            Share your VIP card to confirm your allocation.
          </p>
        </motion.div>

        {/* ── Two-column layout ── */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Left Column: VIP Card */}
          <motion.div variants={itemVariants} className="flex-1 w-full">
            <VIPCard userData={userData} displayPoints={displayPoints} />
          </motion.div>

          {/* Right Column: Info Panel */}
          <motion.div variants={itemVariants} className="flex-1 w-full max-w-sm mx-auto lg:mx-0 space-y-6">
            {/* Points + Credit Panel */}
            <div className="glass-panel rounded-2xl p-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="font-label text-[10px] tracking-[0.25em] text-rb-muted/40 uppercase mb-2">
                    Your Season 1 Points
                  </p>
                  <p className="text-4xl font-bold font-label text-white">
                    {userData.totalPoints.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-label text-[10px] tracking-wider text-rb-muted/40 uppercase">
                    Credit Value
                  </p>
                  <p className="text-brand-gold text-2xl font-bold font-label">
                    ${creditValue}
                  </p>
                </div>
              </div>

              <p className="text-rb-muted/30 text-[10px] font-label mt-3">
                Points → Credit is tier-based. Higher tiers convert better.
              </p>
            </div>

            {/* Perks list */}
            <div className="space-y-2 px-1">
              {['Spend as casino credit', 'Boost leaderboard rank', 'Unlock Season 1 perks'].map((perk) => (
                <div key={perk} className="flex items-center gap-3">
                  <span className="text-brand-gold/50 text-xs">→</span>
                  <span className="text-rb-muted/60 text-sm">{perk}</span>
                </div>
              ))}
            </div>

            {/* Share + Claim buttons */}
            <div className="space-y-3">
              <button
                onClick={handleShare}
                disabled={shared}
                className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-sm tracking-wider transition-all duration-300 ${
                  shared
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] border border-[#1DA1F2]/20'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                {shared ? 'SHARED ✓' : 'SHARE & EARN +1,000 BONUS'}
              </button>

              <button
                onClick={handleClaim}
                disabled={!shared}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm tracking-wider transition-all duration-300 ${
                  shared
                    ? 'border border-brand-red/40 text-[#F0F1F7] shadow-[0_0_50px_rgba(255,59,48,0.15)] hover:shadow-[0_0_80px_rgba(255,59,48,0.3)]'
                    : 'glass-panel text-rb-muted/30 cursor-not-allowed'
                }`}
                style={shared ? {
                  background: 'linear-gradient(to bottom, rgba(255,59,48,0.9), #8B1A1A)',
                } : undefined}
              >
                {!shared && <LockIcon className="w-4 h-4" />}
                {shared ? `CLAIM $${creditValue} CREDIT` : `CLAIM $${creditValue} CREDIT`}
              </button>

              {!shared && (
                <p className="text-center text-[10px] text-rb-muted/25 tracking-widest font-label">
                  Share your VIP card to unlock claim
                </p>
              )}
              {shared && (
                <p className="text-center text-[10px] text-rb-muted/40 tracking-widest font-label">
                  Credit unlocks after first $20 deposit. 1× wagering requirement.
                </p>
              )}
            </div>

            {/* Payment logos */}
            <div className="flex items-center justify-center gap-6 pt-2">
              {['Apple Pay', 'Visa', 'Mastercard', 'Google Pay'].map((name) => (
                <span key={name} className="text-[10px] text-rb-muted/25 tracking-wider font-label uppercase">
                  {name}
                </span>
              ))}
            </div>

            {/* Tagline */}
            <p className="text-center text-rb-muted/15 text-xs italic pt-2">
              See you at the tables.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </motion.section>
  );
};

export default VIPScreen;
