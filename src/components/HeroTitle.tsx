import { motion } from 'framer-motion';

const HeroTitle = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, type: 'spring', stiffness: 80 }}
      className="mb-8"
    >
      <h1 className="text-center font-display text-6xl md:text-8xl lg:text-[7rem] font-bold leading-[0.85] tracking-tight uppercase">
        <span
          className="block text-white/95"
          style={{ textShadow: '0 2px 30px rgba(0,0,0,0.5)' }}
        >
          The House
        </span>
        <span
          className="block bg-gradient-to-b from-[#FF4D42] via-[#FF3B30] to-[#CC2F26] bg-clip-text text-transparent"
          style={{
            filter: 'drop-shadow(0 0 80px rgba(255,59,48,0.4)) drop-shadow(0 0 30px rgba(255,59,48,0.2))',
          }}
        >
          Is Open
        </span>
      </h1>
    </motion.div>
  );
};

export default HeroTitle;
