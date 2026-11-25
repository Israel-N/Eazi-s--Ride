import React from 'react';
import { Star } from 'lucide-react';

const Stars = ({ rating, count = 5 }) => {
  return (
    <div className="flex gap-1">
      {[...Array(count)].map((_, i) => (
        <Star
          key={i}
          size={16}
          className={i < Math.floor(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}
        />
      ))}
    </div>
  );
};

export default Stars;
