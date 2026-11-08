import React from 'react';
import { Star } from 'lucide-react';

const RatingStars = ({ value = 0, onChange, disabled = false, size = 34 }) => {
  return (
    <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label="Rate your ride from 1 to 5 stars">
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(star)}
            className={`rounded-full p-1 transition-transform ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:scale-110 active:scale-95'}`}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            aria-checked={value === star}
            role="radio"
          >
            <Star
              size={size}
              strokeWidth={1.8}
              className={active ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
            />
          </button>
        );
      })}
    </div>
  );
};

export default RatingStars;
