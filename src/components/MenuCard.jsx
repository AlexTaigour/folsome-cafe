import React, { useState } from 'react';
import { Plus, Minus, Coffee, Star } from 'lucide-react';

export const MenuCard = ({ item, quantity, onUpdateQuantity, onOpenDetail }) => {
  const isSpecial = item.price > 40; // Just as an example for badges
  const soldOut = item.isAvailable === false;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail?.(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail?.(item.id);
        }
      }}
      className={`bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col border border-espresso/10 group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] cursor-pointer ${soldOut ? 'grayscale opacity-60' : ''}`}
    >
      <div className="relative aspect-square w-full overflow-hidden">
        {item.image && !imgFailed ? (
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full bg-cream flex items-center justify-center">
            <Coffee size={48} className="text-latte" />
          </div>
        )}
        {soldOut && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-white text-bean px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">Sold Out</span>
          </div>
        )}
        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-sm">
          <Coffee size={14} className="text-espresso" />
        </div>
        {isSpecial && (
          <div className="absolute top-2 left-2 bg-chiya text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm">
            <Star size={10} fill="currentColor" /> Popular
          </div>
        )}
        {quantity > 0 && (
          <div className="absolute inset-0 bg-espresso/20 flex items-center justify-center">
            <span className="bg-espresso text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-xl shadow-lg border-2 border-white">
              {quantity}
            </span>
          </div>
        )}
      </div>

      <div className="p-3 md:p-4 flex flex-col flex-grow">
        <h3 className="font-bold text-bean text-sm md:text-lg leading-tight">{item.name}</h3>
        <p className="text-chiya font-black mt-1 text-base">Rs. {item.price}</p>

        <div className="mt-auto pt-3 flex items-center justify-center">
          {quantity === 0 ? (
            <button
              disabled={soldOut}
              onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.id, 1); }}
              className="w-full py-2.5 rounded-full font-bold text-sm bg-cream text-espresso border border-espresso/10 hover:bg-espresso hover:text-white transition-colors active:scale-95 flex items-center justify-center gap-1 disabled:pointer-events-none"
            >
              <Plus size={16} /> Add
            </button>
          ) : (
            <div className="flex items-center gap-4 bg-cream rounded-full px-2 py-1 border border-espresso/10 w-full justify-between">
              <button
                disabled={soldOut}
                onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.id, -1); }}
                aria-label={`Remove one ${item.name}`}
                className="p-2 rounded-full transition-colors text-espresso hover:bg-white active:scale-90 disabled:pointer-events-none"
              >
                <Minus size={18} />
              </button>
              <span className="font-black text-bean">{quantity}</span>
              <button
                disabled={soldOut}
                onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.id, 1); }}
                aria-label={`Add one ${item.name}`}
                className="p-2 rounded-full text-espresso hover:bg-white transition-colors active:scale-90 disabled:pointer-events-none"
              >
                <Plus size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
