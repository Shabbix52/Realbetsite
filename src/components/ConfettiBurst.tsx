import { useEffect, useRef } from 'react';

interface ConfettiPiece {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  opacity: number;
}

const COLORS = ['#DC2626', '#D4A853', '#FFD700', '#22C55E', '#3B82F6', '#A855F7', '#FFFFFF'];

const ConfettiBurst = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces: ConfettiPiece[] = [];
    const pieceCount = 80;

    // Create confetti burst from center-top
    for (let i = 0; i < pieceCount; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = Math.random() * 8 + 3;
      pieces.push({
        x: canvas.width / 2,
        y: canvas.height * 0.3,
        size: Math.random() * 8 + 3,
        speedX: Math.cos(angle) * speed,
        speedY: Math.sin(angle) * speed - 3,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: 1,
      });
    }

    let animationId: number;
    let frame = 0;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      pieces.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.speedY += 0.12; // gravity
        p.speedX *= 0.99; // air resistance
        p.rotation += p.rotationSpeed;
        p.opacity = Math.max(0, p.opacity - 0.005);

        if (p.opacity <= 0) return;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });

      if (frame < 300 && pieces.some(p => p.opacity > 0)) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-50 pointer-events-none"
    />
  );
};

export default ConfettiBurst;
