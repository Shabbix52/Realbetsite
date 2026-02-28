import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HeroScreenProps {
  onGenerate: () => void;
}

/* ── Floating ember particle ── */
const Ember = ({ delay, x, size }: { delay: number; x: number; size: number }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      width: size,
      height: size,
      left: `${x}%`,
      bottom: '-5%',
      background: `radial-gradient(circle, hsl(${355 + Math.random() * 20} 90% 55% / 0.9), transparent)`,
      filter: `blur(${size < 3 ? 0 : 1}px)`,
    }}
    initial={{ y: 0, opacity: 0, scale: 0 }}
    animate={{
      y: [0, -window.innerHeight * (0.5 + Math.random() * 0.5)],
      x: [0, (Math.random() - 0.5) * 120],
      opacity: [0, 0.8, 0.8, 0],
      scale: [0, 1, 1, 0.3],
    }}
    transition={{
      duration: 5 + Math.random() * 4,
      delay,
      repeat: Infinity,
      ease: 'easeOut',
    }}
  />
);

/* ── Animated horizontal line ── */
const ScanLine = ({ top, delay }: { top: string; delay: number }) => (
  <motion.div
    className="absolute left-0 w-full pointer-events-none z-[9]"
    style={{ top, height: '1px' }}
    initial={{ scaleX: 0, opacity: 0 }}
    animate={{ scaleX: 1, opacity: [0, 0.3, 0] }}
    transition={{ duration: 3, delay, repeat: Infinity, repeatDelay: 8 + Math.random() * 6, ease: 'easeInOut' }}
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

  // Generate embers
  const embers = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    delay: i * 0.6,
    x: 10 + Math.random() * 80,
    size: 2 + Math.random() * 4,
  }));

  return (
    <section className="relative h-screen flex items-center justify-start px-6 md:px-16 lg:px-24 section-hero-atmosphere overflow-hidden">

      {/* ── Floating embers ── */}
      <div className="absolute inset-0 z-[6] pointer-events-none overflow-hidden">
        {embers.map((e) => (
          <Ember key={e.id} delay={e.delay} x={e.x} size={e.size} />
        ))}
      </div>

      {/* ── Scan lines ── */}
      <ScanLine top="25%" delay={2} />
      <ScanLine top="55%" delay={6} />
      <ScanLine top="78%" delay={10} />

      {/* ── Animated red spotlight sweep ── */}
      <motion.div
        className="absolute inset-0 z-[5] pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.15, 0] }}
        transition={{ duration: 6, delay: 1, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
        style={{
          background: 'radial-gradient(ellipse 40% 60% at 30% 50%, hsl(355 83% 41% / 0.3), transparent 70%)',
        }}
      />
      <motion.div
        className="absolute inset-0 z-[5] pointer-events-none"
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
            filter: 'blur(40px)',
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
          {'The realest house is watching who moves first this season.'.split(' ').map((word, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.4, delay: 1.7 + i * 0.06 }}
              className="inline-block mr-[0.3em]"
            >
              {word}
            </motion.span>
          ))}
          <br />
          {'Choose your boxes. Crack them open. And be a VIP of the house you\'ll own.'.split(' ').map((word, i) => (
            <motion.span
              key={`l2-${i}`}
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
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
            className="absolute -inset-4 rounded-lg pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 2, delay: 3.5, repeat: Infinity, repeatDelay: 5 }}
            style={{
              background: 'radial-gradient(ellipse at center, hsl(355 83% 41% / 0.2), transparent 70%)',
              filter: 'blur(15px)',
            }}
          />
          <motion.button
            onClick={handleClick}
            disabled={loading}
            className={`btn-fight pulse-glow text-lg relative ${loading ? 'opacity-40 cursor-not-allowed' : ''}`}
            whileHover={{ scale: 1.03, boxShadow: '0 4px 50px hsla(355, 83%, 41%, 0.6)' }}
            whileTap={{ scale: 0.97 }}
          >
            {/* Shimmer sweep on button */}
            <motion.div
              className="absolute inset-0 pointer-events-none overflow-hidden rounded"
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
                  Open Mystery Box →
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
            filter: 'blur(120px)',
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
