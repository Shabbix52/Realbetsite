import { motion } from 'framer-motion';

const Subtitle = () => {
  return (
    <motion.p
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.6 }}
      className="text-base md:text-lg text-rb-muted/80 mb-12 max-w-md mx-auto leading-relaxed text-center"
    >
      Unbox points. Convert them to credit.
      <br />
      Your Season 1 starts now.
    </motion.p>
  );
};

export default Subtitle;
