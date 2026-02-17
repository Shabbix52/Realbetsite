import { useState } from 'react';
import { motion } from 'framer-motion';
import Logo from '../components/Logo';
import HeroTitle from '../components/HeroTitle';
import Steps from '../components/Steps';
import Subtitle from '../components/Subtitle';
import Stats from '../components/Stats';

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
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      className="relative z-10 flex flex-col items-center justify-center h-screen px-6 overflow-hidden"
    >
      <div className="max-w-3xl w-full flex flex-col items-center">
        <Steps />

        {/* Season badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mb-10"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel">
            {/* Crown icon */}
            <svg className="w-3.5 h-3.5 text-brand-gold/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
              <path d="M5 21h14" />
            </svg>
            <span className="font-label text-[10px] tracking-[0.2em] text-rb-muted/70 uppercase">
              Season 1 • Exclusive Access
            </span>
          </span>
        </motion.div>

        <Logo />
        <HeroTitle />
        <Subtitle />

        {/* CTA Button */}
        <motion.button
          whileHover={!loading ? { scale: 1.02 } : {}}
          whileTap={!loading ? { scale: 0.97 } : {}}
          onClick={handleClick}
          disabled={loading}
          className={`group relative w-full max-w-sm mx-auto py-4 px-8 rounded-xl font-display font-bold tracking-[0.15em] text-white text-sm uppercase border border-white/[0.08] overflow-hidden active:scale-[0.97] transition-transform ${loading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{
            background: 'linear-gradient(180deg, #C02020 0%, #8B1414 50%, #5C0E0E 100%)',
            boxShadow: '0 1px 0 0 rgba(255,255,255,0.08) inset, 0 -2px 6px 0 rgba(0,0,0,0.4) inset, 0 8px 40px -8px rgba(255,59,48,0.3), 0 2px 12px rgba(0,0,0,0.6)',
          }}
        >
          {/* Top highlight line */}
          <span className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {/* Shimmer sweep on hover */}
          {!loading && (
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent -skew-x-12 translate-x-[-150%] group-hover:translate-x-[250%] transition-transform duration-1000 ease-in-out" />
          )}

          <span className="relative z-10 flex items-center justify-center gap-3">
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white/80" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                CONNECTING...
              </>
            ) : (
              <>
                Enter The House
                {/* ChevronRight arrow */}
                <svg className="w-4 h-4 opacity-60 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </>
            )}
          </span>
        </motion.button>

        <Stats />
      </div>
    </motion.main>
  );
};

export default HeroScreen;
