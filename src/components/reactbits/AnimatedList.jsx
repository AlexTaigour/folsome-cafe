import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ReactBits-style AnimatedList: staggered entry, layout shift, exit collapse.
// Children must carry stable keys via the `items` + `renderItem` API.
export default function AnimatedList({ items, keyOf, renderItem, className = '', stagger = 0.05 }) {
  return (
    <div className={className}>
      <AnimatePresence mode="popLayout">
        {items.map((item, i) => (
          <motion.div
            key={keyOf(item)}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35, delay: Math.min(i * stagger, 0.4), ease: 'easeOut' }}
          >
            {renderItem(item)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
