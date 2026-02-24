import { useState } from 'react';
import { motion } from 'framer-motion';

interface HeroScreenProps {
  onGenerate: () => void;
}

const HeroScreen = ({ onGenerate }: HeroScreenProps) => {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    setTimeout(() => {
      onGenerate();
    }, 1500);
  };

  return (
    <section className="relative h-screen flex items-center justify-start px-6 md:px-16 lg:px-24 section-hero-atmosphere overflow-hidden">

      {/* Hero Image Container */}
      <motion.div
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1, delay: 0.4 }}
        className="absolute right-[-8%] md:right-[-4%] lg:right-[0%] bottom-0 z-[8] pointer-events-none hidden md:block"
        style={{ width: 'clamp(500px, 55vw, 950px)' }}
      >
        {/* Color overlay */}
        <div
          className="absolute inset-0 z-[1]"
          style={{
            background: 'linear-gradient(to top, hsl(355 83% 41% / 0.25) 0%, transparent 40%), linear-gradient(to left, hsl(355 83% 41% / 0.1) 0%, transparent 30%)',
          }}
        />

        {/* Shadow overlay */}
        <div
          className="absolute inset-0 z-[0]"
          style={{ boxShadow: '0 0 120px 60px hsl(0 0% 0% / 0.8)' }}
        />

        {/* Hero image */}
        <img
          src="/conor-hero.png"
          alt=""
          className="relative z-[2] w-full h-auto object-contain object-bottom"
          style={{
            filter: 'saturate(0.85) contrast(1.15) brightness(0.9)',
            maskImage: 'linear-gradient(to top, transparent 0%, black 8%), linear-gradient(to left, transparent 0%, black 5%), linear-gradient(to right, transparent 0%, black 15%)',
            WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 8%), linear-gradient(to left, transparent 0%, black 5%)',
            WebkitMaskComposite: 'destination-in',
            maskComposite: 'intersect' as any,
          }}
        />

        {/* Noise overlay on image */}
        <div
          className="absolute inset-0 z-[3] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.12'/%3E%3C/svg%3E")`,
            mixBlendMode: 'overlay',
            opacity: 0.6,
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

      {/* Light line */}
      <div className="absolute top-20 right-[15%] w-px h-[60%] bg-gradient-to-b from-transparent via-blood-glow/30 to-transparent rotate-12 hidden md:block z-[9]" />

      {/* Text container */}
      <div className="relative z-20 max-w-3xl mt-[-8vh] md:ml-8">

        {/* Badge */}
        <motion.p
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="font-mono text-xs tracking-[0.3em] text-rb-muted mb-4 uppercase"
        >
          RealBet · Season 1
        </motion.p>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="font-headline text-[clamp(4rem,12vw,10rem)] leading-[0.85] tracking-wider text-[#F2F2F2] mb-6"
          style={{
            textShadow: '0 0 60px hsl(355 83% 41% / 0.3), 0 4px 12px hsl(0 0% 0% / 0.8)',
          }}
        >
          THE HOUSE<br />
          <span className="text-brand-red">IS OPEN</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="font-mono text-sm text-rb-muted max-w-md mb-10 leading-relaxed"
        >
          Claim your ID. Choose your box. Walk the path to gold.<br />
          No second chances.
        </motion.p>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.8 }}
          onClick={handleClick}
          disabled={loading}
          className={`btn-fight pulse-glow text-lg ${loading ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {loading ? 'Connecting...' : 'Enter the Arena →'}
        </motion.button>
      </div>

      {/* Right side glow */}
      <div className="absolute right-0 top-0 bottom-0 w-1/2 hidden md:block z-[1]">
        <div className="absolute inset-0 bg-gradient-to-l from-blood-deep/25 to-transparent" />
        <div className="absolute bottom-[15%] right-[15%] w-80 h-80 rounded-full bg-brand-red/[0.08] blur-[120px]" />
      </div>
    </section>
  );
};

export default HeroScreen;
