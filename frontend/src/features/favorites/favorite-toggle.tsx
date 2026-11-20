import { Heart } from 'lucide-react';

export function FavoriteToggle({
  name,
  saved,
  disabled,
  onToggle,
  inline = false,
}: {
  name: string;
  saved: boolean;
  disabled: boolean;
  onToggle: () => void;
  inline?: boolean;
}) {
  const action = saved ? 'Bỏ yêu thích' : 'Thêm vào yêu thích';
  return (
    <button
      type="button"
      className={inline ? 'button secondary wide favorite-inline' : 'shopgo-retail-favorite'}
      aria-label={`${action} ${name}`}
      aria-pressed={saved}
      title={action}
      disabled={disabled}
      onClick={onToggle}
    >
      <Heart size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
      {inline && action}
    </button>
  );
}
