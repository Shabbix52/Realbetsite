import { motion } from 'framer-motion';

const easeCustom = [0.22, 1, 0.36, 1];

const Subtitle = () => {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6, duration: 0.6, ease: easeCustom }}
      className="font-mono text-sm md:text-base text-rb-muted mb-8 max-w-lg leading-relaxed"
    >
      Claim your ID. Choose your box. Walk the path to gold.
      <br />
      No second chances.
    </motion.p>
  );
};

export default Subtitle;
