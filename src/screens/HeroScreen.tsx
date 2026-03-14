import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HeroScreenProps {
  onGenerate: () => void;
}

const HERO_EMBERS = [
  { id: 0, delay: 0, x: 14, size: 2.4, hue: 357, yFactor: 0.54, xDrift: 34, duration: 6.2 },
  { id: 1, delay: 0.6, x: 23, size: 3.1, hue: 364, yFactor: 0.66, xDrift: -28, duration: 7.1 },
  { id: 2, delay: 1.2, x: 31, size: 2.8, hue: 360, yFactor: 0.58, xDrift: 22, duration: 5.8 },
  { id: 3, delay: 1.8, x: 41, size: 4.1, hue: 371, yFactor: 0.74, xDrift: -36, duration: 7.8 },
  { id: 4, delay: 2.4, x: 53, size: 2.3, hue: 355, yFactor: 0.62, xDrift: 18, duration: 6.4 },
  { id: 5, delay: 3, x: 62, size: 3.4, hue: 366, yFactor: 0.69, xDrift: -24, duration: 8.1 },
  { id: 6, delay: 3.6, x: 71, size: 2.7, hue: 359, yFactor: 0.57, xDrift: 26, duration: 6.9 },
  { id: 7, delay: 4.2, x: 79, size: 3.8, hue: 373, yFactor: 0.76, xDrift: -30, duration: 7.4 },
  { id: 8, delay: 4.8, x: 87, size: 2.2, hue: 356, yFactor: 0.51, xDrift: 16, duration: 5.9 },
  { id: 9, delay: 5.4, x: 47, size: 3.3, hue: 362, yFactor: 0.64, xDrift: -20, duration: 7.2 },
];

const HERO_SCAN_LINES = [
  { top: '25%', delay: 2, repeatDelay: 9 },
  { top: '55%', delay: 6, repeatDelay: 12 },
  { top: '78%', delay: 10, repeatDelay: 14 },
];

/* ── Floating ember particle ── */
const Ember = ({ delay, x, size, hue, yFactor, xDrift, duration }: { delay: number; x: number; size: number; hue: number; yFactor: number; xDrift: number; duration: number }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      width: size,
      height: size,
      left: `${x}%`,
      bottom: '-5%',
      background: `radial-gradient(circle, hsl(${hue} 90% 55% / 0.9), transparent)`,
      filter: `blur(${size < 3 ? 0 : 1}px)`,
    }}
    initial={{ y: 0, opacity: 0, scale: 0 }}
    animate={{
      y: [0, -(typeof window !== 'undefined' ? window.innerHeight : 900) * yFactor],
      x: [0, xDrift],
      opacity: [0, 0.8, 0.8, 0],
      scale: [0, 1, 1, 0.3],
    }}
    transition={{
      duration,
      delay,
      repeat: Infinity,
      ease: 'easeOut',
    }}
  />
);

/* ── Animated horizontal line ── */
const ScanLine = ({ top, delay, repeatDelay }: { top: string; delay: number; repeatDelay: number }) => (
  <motion.div
    className="absolute left-0 w-full pointer-events-none z-[9]"
    style={{ top, height: '1px' }}
    initial={{ scaleX: 0, opacity: 0 }}
    animate={{ scaleX: 1, opacity: [0, 0.3, 0] }}
    transition={{ duration: 3, delay, repeat: Infinity, repeatDelay, ease: 'easeInOut' }}
  >
    <div className="w-full h-full bg-gradient-to-r from-transparent via-brand-red/40 to-transparent" />
  </motion.div>
);

/* ── Letter-by-letter stagger for headings ── */
const StaggerText = ({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) => (
  <span className={className}>
    {text.split('').map((char, i) => (
      <motion.span
        key={i}
        initial={{ opacity: 0, y: 30, rotateX: -90 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{
          duration: 0.4,
          delay: delay + i * 0.035,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{ display: 'inline-block', transformOrigin: 'bottom' }}
      >
        {char === ' ' ? '\u00A0' : char}
      </motion.span>
    ))}
  </span>
);

const HeroScreen = ({ onGenerate }: HeroScreenProps) => {
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClick = () => {
    setLoading(true);
    setTimeout(() => {
      onGenerate();
    }, 1500);
  };

  return (
    <section className="relative h-screen flex items-center justify-start px-6 md:px-16 lg:px-24 section-hero-atmosphere overflow-hidden">

      {/* ── Floating embers ── */}
      <div className="absolute inset-0 z-[6] pointer-events-none overflow-hidden hidden md:block">
        {HERO_EMBERS.map((e) => (
          <Ember key={e.id} delay={e.delay} x={e.x} size={e.size} hue={e.hue} yFactor={e.yFactor} xDrift={e.xDrift} duration={e.duration} />
        ))}
      </div>

      {/* ── Scan lines ── */}
      {HERO_SCAN_LINES.map((line) => (
        <div key={line.top} className="hidden md:block">
          <ScanLine top={line.top} delay={line.delay} repeatDelay={line.repeatDelay} />
        </div>
      ))}

      {/* ── Animated red spotlight sweep ── */}
      <motion.div
        className="absolute inset-0 z-[5] pointer-events-none hidden md:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.15, 0] }}
        transition={{ duration: 6, delay: 1, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
        style={{
          background: 'radial-gradient(ellipse 40% 60% at 30% 50%, hsl(355 83% 41% / 0.3), transparent 70%)',
        }}
      />
      <motion.div
        className="absolute inset-0 z-[5] pointer-events-none hidden lg:block"
        animate={{
          background: [
            'radial-gradient(ellipse 30% 50% at 20% 60%, hsl(355 83% 41% / 0.08), transparent 70%)',
            'radial-gradient(ellipse 30% 50% at 80% 40%, hsl(355 83% 41% / 0.08), transparent 70%)',
            'radial-gradient(ellipse 30% 50% at 20% 60%, hsl(355 83% 41% / 0.08), transparent 70%)',
          ],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Hero Image Container */}
      <motion.div
        initial={{ opacity: 0, x: 80, scale: 1.05 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="absolute right-[-12%] md:right-[-8%] lg:right-[-4%] bottom-0 z-[8] pointer-events-none hidden md:block"
        style={{ width: 'clamp(760px, 78vw, 1400px)' }}
      >
        {/* Pulsing red aura behind hero */}
        <motion.div
          className="absolute inset-0 z-[1]"
          animate={{
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'radial-gradient(ellipse 50% 60% at 50% 60%, hsl(355 83% 30% / 0.3), transparent 70%)',
            filter: 'blur(28px)',
          }}
        />
        <img
          src="/conor-hero.png"
          alt=""
          className="relative z-[2] w-full h-auto object-contain object-bottom"
          style={{
            filter: 'saturate(0.85) contrast(1.15) brightness(0.9) drop-shadow(0 0 80px hsl(0 0% 0% / 0.9)) drop-shadow(0 0 40px hsl(355 83% 41% / 0.2))',
            maskImage: 'linear-gradient(to top, transparent 0%, black 8%), linear-gradient(to left, transparent 0%, black 5%), linear-gradient(to right, transparent 0%, black 15%)',
            WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 8%), linear-gradient(to left, transparent 0%, black 5%)',
            WebkitMaskComposite: 'destination-in',
            maskComposite: 'intersect' as any,
          }}
        />
      </motion.div>

      {/* Vignette around hero image */}
      <div
        className="absolute inset-0 z-[7] pointer-events-none hidden md:block"
        style={{
          background: 'radial-gradient(ellipse 50% 70% at 70% 50%, transparent 20%, hsl(0 0% 0% / 0.4) 70%, hsl(0 0% 0% / 0.7) 100%)',
        }}
      />

      {/* ── Animated diagonal light line ── */}
      <motion.div
        className="absolute top-20 right-[15%] w-px h-[60%] hidden md:block z-[9] origin-top"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ duration: 1.5, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{
          transform: 'rotate(12deg)',
        }}
      >
        <motion.div
          className="w-full h-full"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'linear-gradient(to bottom, transparent, hsl(355 83% 41% / 0.35), transparent)',
          }}
        />
      </motion.div>

      {/* ── Text container ── */}
      <div className="relative z-20 max-w-3xl mt-[-8vh] md:ml-8">

        {/* Badge — slide in with a wipe */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: 'auto' }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden mb-4"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.7 }}
            className="font-mono text-xs tracking-[0.3em] text-rb-muted uppercase whitespace-nowrap"
          >
            <motion.span
              className="inline-block w-8 h-px bg-brand-red/60 align-middle mr-3"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.4, delay: 0.9 }}
              style={{ transformOrigin: 'left' }}
            />
            RealBet · Season 1
          </motion.p>
        </motion.div>

        {/* Title — letter-by-letter stagger with 3D flip */}
        <h1
          className="font-headline text-[clamp(4rem,12vw,10rem)] leading-[0.85] tracking-wider text-[#F2F2F2] mb-6"
          style={{
            textShadow: '0 0 60px hsl(355 83% 41% / 0.3), 0 4px 12px hsl(0 0% 0% / 0.8)',
          }}
        >
          {mounted && (
            <>
              <StaggerText text="THE HOUSE" delay={0.5} />
              <br />
              <StaggerText text="IS OPEN" className="text-brand-red" delay={0.85} />
            </>
          )}
        </h1>

        {/* ── Red divider line ── */}
        <motion.div
          className="flex items-center gap-3 mb-6 max-w-[280px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
        >
          <motion.div
            className="flex-1 h-px bg-gradient-to-r from-brand-red/60 to-transparent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'left' }}
          />
          <motion.div
            className="w-2 h-2 bg-brand-red/70 rotate-45"
            initial={{ scale: 0, rotate: 45 }}
            animate={{ scale: 1, rotate: 45 }}
            transition={{ duration: 0.3, delay: 1.8, type: 'spring', stiffness: 300 }}
          />
          <motion.div
            className="flex-1 h-px bg-gradient-to-l from-brand-red/60 to-transparent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'right' }}
          />
        </motion.div>

        {/* Subtitle — typed feel with word-by-word */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.6 }}
          className="font-mono text-sm text-rb-muted max-w-md mb-10 leading-relaxed"
        >
          {'The house doesn\'t wait. Neither should you.'.split(' ').map((word, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1.7 + i * 0.06 }}
              className="inline-block mr-[0.3em]"
            >
              {word}
            </motion.span>
          ))}
          <br />
          {'Three boxes. One Power Score. The higher you score, the bigger your Season 1 allocation.'.split(' ').map((word, i) => (
            <motion.span
              key={`l2-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 2.3 + i * 0.05 }}
              className="inline-block mr-[0.3em]"
            >
              {word}
            </motion.span>
          ))}
        </motion.p>

        {/* CTA — dramatic entrance with expanding glow */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 3.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          {/* Glow ring behind button */}
          <motion.div
            className="absolute -inset-4 rounded-lg pointer-events-none hidden md:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.35, 0] }}
            transition={{ duration: 2, delay: 3.5, repeat: Infinity, repeatDelay: 8 }}
            style={{
              background: 'radial-gradient(ellipse at center, hsl(355 83% 41% / 0.2), transparent 70%)',
              filter: 'blur(10px)',
            }}
          />
          <motion.button
            onClick={handleClick}
            disabled={loading}
            className={`btn-fight md:pulse-glow text-lg relative ${loading ? 'opacity-40 cursor-not-allowed' : ''}`}
            whileHover={{ scale: 1.03, boxShadow: '0 4px 50px hsla(355, 83%, 41%, 0.6)' }}
            whileTap={{ scale: 0.97 }}
          >
            {/* Shimmer sweep on button */}
            <motion.div
              className="absolute inset-0 pointer-events-none overflow-hidden rounded hidden md:block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.5 }}
            >
              <motion.div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.05) 50%, transparent 55%)',
                }}
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2, delay: 4, repeat: Infinity, repeatDelay: 6, ease: 'easeInOut' }}
              />
            </motion.div>
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2"
                >
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                  Connecting...
                </motion.span>
              ) : (
                <motion.span
                  key="cta"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  OPEN MYSTERY BOXES →
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>
      </div>

      {/* Right side glow — now animated */}
      <div className="absolute right-0 top-0 bottom-0 w-1/2 hidden md:block z-[1]">
        <div className="absolute inset-0 bg-gradient-to-l from-blood-deep/25 to-transparent" />
        <motion.div
          className="absolute bottom-[15%] right-[15%] w-80 h-80 rounded-full"
          animate={{
            opacity: [0.08, 0.15, 0.08],
            scale: [1, 1.15, 1],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'radial-gradient(circle, hsl(355 83% 41% / 0.12), transparent 70%)',
            filter: 'blur(72px)',
          }}
        />
      </div>

      {/* ── Bottom fog / mist ── */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-32 z-[10] pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 2 }}
        style={{
          background: 'linear-gradient(to top, hsl(240 18% 2% / 0.8), transparent)',
        }}
      />
    </section>
  );
};

export default HeroScreen;
