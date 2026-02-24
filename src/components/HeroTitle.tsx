import { motion } from 'framer-motion';

const easeCustom = [0.22, 1, 0.36, 1];

const HeroTitle = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.8, ease: easeCustom }}
      className="mb-6"
    >
      <h1
        className="font-headline text-[clamp(4rem,12vw,10rem)] leading-[0.85] tracking-wider uppercase"
        style={{
          textShadow: '0 0 60px hsla(355, 83%, 41%, 0.3), 0 4px 12px hsla(0, 0%, 0%, 0.8)',
        }}
      >
        <span className="block text-[#F2F2F2]">
          The House
        </span>
        <span className="block text-brand-red">
          Is Open
        </span>
      </h1>
    </motion.div>
  );
};

export default HeroTitle;
