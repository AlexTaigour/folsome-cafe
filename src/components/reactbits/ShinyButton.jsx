import React from 'react';
import { motion } from 'motion/react';

// ReactBits-style ShinyButton: sheen sweep on hover + press scale.
export default function ShinyButton({ children, className = '', ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`relative overflow-hidden group ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
      <span
        aria-hidden="true"
        className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/30 to-transparent"
      />
    </motion.button>
  );
}
