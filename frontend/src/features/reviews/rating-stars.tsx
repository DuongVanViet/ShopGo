import { Star } from 'lucide-react';

export const ratings = [1, 2, 3, 4, 5] as const;

export function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="review-stars" role="img" aria-label={`${rating} trên 5 sao`}>
      {ratings.map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          size={17}
          fill={value <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}
