import { motion } from 'framer-motion';

const Stats = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8, duration: 0.6 }}
      className="mt-14 flex flex-col items-center"
    >
      <p className="text-white/[0.08] text-[11px] italic tracking-wider">
        The House remembers.
      </p>
    </motion.div>
  );
};

export default Stats;
