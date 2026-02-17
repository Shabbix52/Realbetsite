import { useMemo } from 'react';

const ParticleBackground = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.06 + 0.02,
      duration: Math.random() * 30 + 20,
      delay: Math.random() * 20,
      driftX: (Math.random() - 0.5) * 40,
    }));
  }, []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={p.id}
          className="red-particle animate-particle"
          style={{
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            '--particle-opacity': p.opacity,
            '--duration': `${p.duration}s`,
            '--drift-x': `${p.driftX}px`,
            animationDelay: `${p.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
};

export default ParticleBackground;
