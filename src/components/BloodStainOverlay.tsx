const BloodStainOverlay = () => {
  return (
    <>
      {/* Blood stain layer 1: full screen cover */}
      <div
        className="fixed inset-0 z-[8] pointer-events-none"
        style={{
          backgroundImage: 'url(/blood-stain.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.15,
          filter: 'blur(2px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Blood stain layer 2: shifted & rotated (desktop) */}
      <div
        className="fixed inset-0 z-[8] pointer-events-none hidden md:block"
        style={{
          backgroundImage: 'url(/blood-stain.png)',
          backgroundSize: '150% 150%',
          backgroundPosition: '30% 70%',
          opacity: 0.08,
          filter: 'blur(4px)',
          mixBlendMode: 'screen',
          transform: 'rotate(180deg)',
        }}
      />
    </>
  );
};

export default BloodStainOverlay;
