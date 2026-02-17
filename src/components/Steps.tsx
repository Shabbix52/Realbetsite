import { motion } from 'framer-motion';

interface StepsProps {
  currentStep?: number;
  totalSteps?: number;
  label?: string;
}

const Steps = ({ currentStep = 1, totalSteps = 7, label = 'Entry' }: StepsProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-4 right-4 z-50"
    >
      <span className="font-label text-[10px] tracking-[0.15em] text-rb-muted/40">
        Step {currentStep}/{totalSteps} • {label}
      </span>
    </motion.div>
  );
};

export default Steps;
