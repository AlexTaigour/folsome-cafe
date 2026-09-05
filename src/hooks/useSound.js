import { useCallback, useState } from 'react';

// Two-tone chime via Web Audio — no asset file needed. Mute preference
// persists per device (it's a device setting, not account data).
export function useSound(storageKey = 'tvx_sound') {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(storageKey) !== 'off');

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      localStorage.setItem(storageKey, prev ? 'off' : 'on');
      return !prev;
    });
  }, [storageKey]);

  const chime = useCallback(() => {
    if (localStorage.getItem(storageKey) === 'off') return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const play = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      play(880, 0, 0.35);
      play(1174.66, 0.18, 0.45);
      setTimeout(() => ctx.close(), 1200);
    } catch {}
  }, [storageKey]);

  return { enabled, toggle, chime };
}
