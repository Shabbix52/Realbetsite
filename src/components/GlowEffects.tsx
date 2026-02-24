const GlowEffects = () => {
  return (
    <>
      {/* Layer 1 (z-[1]): Blood glow radials from bottom */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: [
            'radial-gradient(ellipse 80% 50% at 45% 105%, hsl(0 100% 15% / 0.35) 0%, transparent 60%)',
            'radial-gradient(ellipse 60% 40% at 55% 110%, hsl(355 83% 41% / 0.12) 0%, transparent 55%)',
            'radial-gradient(ellipse 40% 30% at 35% 95%, hsl(0 100% 10% / 0.2) 0%, transparent 50%)',
          ].join(', '),
          mixBlendMode: 'screen',
        }}
      />

      {/* Layer 2 (z-[2]): Texture background */}
      <div
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          backgroundImage: 'url(/texture-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.1,
          mixBlendMode: 'multiply',
        }}
      />

      {/* Layer 3 (z-[3]): Subtle ambient radials */}
      <div
        className="fixed inset-0 z-[3] pointer-events-none"
        style={{
          background: [
            'radial-gradient(ellipse 120% 60% at 30% 40%, hsl(0 0% 20% / 0.05) 0%, transparent 70%)',
            'radial-gradient(ellipse 100% 80% at 70% 60%, hsl(0 0% 15% / 0.04) 0%, transparent 60%)',
            'radial-gradient(ellipse 80% 40% at 50% 80%, hsl(355 30% 12% / 0.06) 0%, transparent 50%)',
          ].join(', '),
          mixBlendMode: 'screen',
        }}
      />

      {/* Layer 4 (z-[4]): Vignette */}
      <div
        className="fixed inset-0 z-[4] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 65% at center, transparent 20%, hsl(240 18% 2% / 0.4) 60%, hsl(240 18% 1% / 0.85) 100%)',
        }}
      />

      {/* Layer 5 (z-[5]): Light lines (desktop only) */}
      <div
        className="fixed z-[5] pointer-events-none hidden md:block"
        style={{
          top: '10%',
          right: '8%',
          width: '2px',
          height: '55%',
          background: 'linear-gradient(to bottom, transparent, hsl(355 83% 41% / 0.15), hsl(355 83% 41% / 0.08), transparent)',
          transform: 'rotate(15deg)',
          filter: 'blur(1px)',
        }}
      />
      <div
        className="fixed z-[5] pointer-events-none hidden lg:block"
        style={{
          top: '25%',
          left: '5%',
          width: '1px',
          height: '40%',
          background: 'linear-gradient(to bottom, transparent, hsl(355 83% 41% / 0.08), transparent)',
          transform: 'rotate(-8deg)',
          filter: 'blur(1px)',
        }}
      />

      {/* Layer 6 (z-[6]): SVG noise dust */}
      <div
        className="fixed inset-0 z-[6] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='dust'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='5' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23dust)' opacity='0.04'/%3E%3C/svg%3E")`,
          mixBlendMode: 'overlay',
          opacity: 0.5,
        }}
      />
    </>
  );
};

export default GlowEffects;
