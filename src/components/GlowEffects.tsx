const GlowEffects = () => {
  return (
    <>
      {/* Red center glow */}
      <div
        className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[900px] pointer-events-none z-0 opacity-[0.07]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,59,48,0.8) 0%, transparent 70%)',
        }}
      />

      {/* Gold undertone */}
      <div
        className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1400px] h-[600px] pointer-events-none z-0 opacity-[0.04]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(246,195,74,0.5) 0%, transparent 70%)',
        }}
      />

      {/* Full-screen vignette */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(7,7,11,0.95) 100%)',
        }}
      />

      {/* Noise texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[2] opacity-[0.035]"
        style={{
          mixBlendMode: 'overlay',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '256px 256px',
        }}
      />

      {/* Grid pattern (top-left corner) */}
      <div
        className="fixed top-0 left-0 w-[400px] h-[400px] pointer-events-none z-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          maskImage: 'linear-gradient(to bottom right, rgba(0,0,0,0.5) 0%, transparent 70%)',
          WebkitMaskImage: 'linear-gradient(to bottom right, rgba(0,0,0,0.5) 0%, transparent 70%)',
        }}
      />
    </>
  );
};

export default GlowEffects;
