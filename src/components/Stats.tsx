import { motion } from 'framer-motion';

const Stats = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.2, duration: 0.6 }}
      className="mt-12 flex flex-col items-start"
    >
      <p className="font-mono text-[11px] text-rb-muted/30 italic tracking-wider">
        The House remembers.
      </p>
    </motion.div>
  );
};

export default Stats;
