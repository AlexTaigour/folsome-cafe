import React from 'react';
import { motion } from 'motion/react';

// ReactBits-style BlurText: per-word blur+rise reveal.
export default function BlurText({ text, className = '', delay = 0.06, as: Tag = 'span' }) {
  const words = String(text).split(' ');
  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, filter: 'blur(8px)', y: 12 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ duration: 0.5, delay: i * delay, ease: 'easeOut' }}
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </Tag>
  );
}
