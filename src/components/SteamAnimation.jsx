
import React from 'react';

export const SteamAnimation = () => {
  return (
    <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
      <div className="steam-particle w-1 h-3 bg-white/40 rounded-full" style={{ animationDelay: '0s' }}></div>
      <div className="steam-particle w-1 h-4 bg-white/50 rounded-full" style={{ animationDelay: '0.4s' }}></div>
      <div className="steam-particle w-1 h-2 bg-white/30 rounded-full" style={{ animationDelay: '0.8s' }}></div>
    </div>
  );
};
