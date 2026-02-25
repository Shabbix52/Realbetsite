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
        className="absolute right-[-12%] md:right-[-8%] lg:right-[-4%] bottom-0 z-[8] pointer-events-none hidden md:block"
        style={{ width: 'clamp(760px, 78vw, 1400px)' }}
      >
        {/* Hero image — filters handle tinting; drop-shadow follows the alpha silhouette */}
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
