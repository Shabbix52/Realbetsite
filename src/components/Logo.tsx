import { motion } from 'framer-motion';

const Logo = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="flex items-center justify-center mb-10"
    >
      <img
        src="/realbet-logo.png"
        alt="RealBet"
        className="h-8 md:h-10 mx-auto opacity-60"
      />
    </motion.div>
  );
};

export default Logo;
