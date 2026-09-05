import React from 'react';
import { CAFE_LOGO, CAFE_NAME } from '../utils/brand';

// Cozy "brewing" loader shared across the app so every waiting state feels the
// same: a cup slowly fills with chiya-coloured tea, steam drifts up, and an
// animated label reads while data loads.
//   splash      → full-screen branded version (logo + name + warm gradient)
//   fullscreen  → centred inside a min-h-screen wrapper (no branding)
//   tone        → 'dark' for dark backgrounds (light strokes),
//                 'light' for cream backgrounds (espresso strokes)
export default function BrewingLoader({
  label = 'Brewing',
  splash = false,
  fullscreen = false,
  tone = 'dark',
}) {
  const dark = tone === 'dark';
  const stroke = dark ? 'border-white/70' : 'border-espresso/60';
  const saucer = dark ? 'bg-white/60' : 'bg-espresso/40';
  const steam = dark ? 'bg-white' : 'bg-espresso';
  const textCls = dark ? 'text-cream/90' : 'text-espresso';

  const cup = (
    <div className="animate-cup-bob flex flex-col items-center" role="status" aria-live="polite">
      <div className="relative">
        {/* steam */}
        <div className="pointer-events-none absolute -top-6 left-1/2 flex -translate-x-1/2 gap-1.5">
          <span className={`steam-particle h-4 w-1 rounded-full ${steam}`} style={{ opacity: dark ? 0.4 : 0.3, animationDelay: '0s' }} />
          <span className={`steam-particle h-5 w-1 rounded-full ${steam}`} style={{ opacity: dark ? 0.55 : 0.4, animationDelay: '0.5s' }} />
          <span className={`steam-particle h-3 w-1 rounded-full ${steam}`} style={{ opacity: dark ? 0.35 : 0.25, animationDelay: '1s' }} />
        </div>
        {/* cup body */}
        <div className={`relative h-16 w-20 overflow-hidden rounded-b-[1.6rem] rounded-t-md border-2 ${stroke} ${dark ? 'bg-white/10' : 'bg-white/60'} backdrop-blur-sm`}>
          <div className="brew-liquid absolute inset-x-0 bottom-0 bg-gradient-to-t from-bean via-chiya to-latte">
            <span className="brew-bubble absolute bottom-1 left-3 h-1.5 w-1.5 rounded-full bg-white/50" style={{ animationDelay: '0.2s' }} />
            <span className="brew-bubble absolute bottom-1 left-9 h-2 w-2 rounded-full bg-white/40" style={{ animationDelay: '1s' }} />
            <span className="brew-bubble absolute bottom-1 left-14 h-1 w-1 rounded-full bg-white/50" style={{ animationDelay: '1.7s' }} />
          </div>
        </div>
        {/* handle */}
        <div className={`absolute top-3 -right-3 h-7 w-4 rounded-r-full border-2 ${stroke}`} />
      </div>
      {/* saucer */}
      <div className={`mt-1.5 h-1.5 w-24 rounded-full ${saucer}`} />
      <p className={`brew-dots mt-6 text-sm font-bold tracking-wide ${textCls}`}>{label}</p>
    </div>
  );

  if (splash) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-espresso to-bean text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(199,107,42,0.35),transparent_60%)]" />
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-chiya/30 blur-3xl animate-halo" />
        <div className="relative z-10 flex flex-col items-center px-6 text-center">
          <img src={CAFE_LOGO} alt="" fetchPriority="high" decoding="async" className="w-24 h-auto drop-shadow-lg" />
          <h3 className="mt-2 text-3xl md:text-5xl font-bold handwritten">{CAFE_NAME}</h3>
          <div className="mt-10">{cup}</div>
        </div>
      </div>
    );
  }

  if (fullscreen) {
    return <div className="min-h-screen flex items-center justify-center">{cup}</div>;
  }

  return cup;
}
