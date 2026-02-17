import { motion } from 'framer-motion';

const CTAButton = () => {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="group relative overflow-hidden px-10 py-5 rounded-xl font-bold text-white text-lg tracking-[0.15em] uppercase cursor-pointer border-0 outline-none"
      style={{
        background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 50%, #7F1D1D 100%)',
        boxShadow: '0 0 40px rgba(220, 38, 38, 0.4), 0 0 80px rgba(220, 38, 38, 0.15)',
      }}
    >
      {/* Shimmer effect */}
      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <span
          className="absolute inset-0 animate-shimmer"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
            width: '50%',
          }}
        />
      </span>

      {/* Glow border */}
      <span
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: 'linear-gradient(135deg, rgba(220,38,38,0.6), transparent, rgba(220,38,38,0.6))',
          padding: '1px',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'xor',
          WebkitMaskComposite: 'xor',
        }}
      />

      <span className="relative z-10 flex items-center gap-3">
        <span className="text-brand-gold">✦</span>
        GENERATE MY VIP CARD
      </span>
    </motion.button>
  );
};

export default CTAButton;
