import React, { useCallback, useRef } from 'react';

// ReactBits-style ClickSpark: canvas spark burst at the click point.
// Wrap any clickable subtree; purely decorative, doesn't affect events.
export default function ClickSpark({
  children,
  sparkColor = '#c76b2a',
  sparkCount = 8,
  sparkRadius = 18,
  className = '',
}) {
  const canvasRef = useRef(null);

  const burst = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const ctx = canvas.getContext('2d');
      const start = performance.now();
      const duration = 450;

      const draw = (now) => {
        const t = Math.min(1, (now - start) / duration);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const eased = 1 - Math.pow(1 - t, 3);
        for (let i = 0; i < sparkCount; i++) {
          const angle = (Math.PI * 2 * i) / sparkCount;
          const dist = eased * sparkRadius;
          const len = 8 * (1 - eased);
          ctx.strokeStyle = sparkColor;
          ctx.globalAlpha = 1 - t;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist);
          ctx.lineTo(x + Math.cos(angle) * (dist + len), y + Math.sin(angle) * (dist + len));
          ctx.stroke();
        }
        if (t < 1) requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      };
      requestAnimationFrame(draw);
    },
    [sparkColor, sparkCount, sparkRadius]
  );

  return (
    <div className={`relative ${className}`} onClickCapture={burst}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-10"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
