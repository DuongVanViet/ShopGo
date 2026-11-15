import { UserRound } from 'lucide-react';

function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return '';
  return [words[0], words.length > 1 ? words[words.length - 1] : '']
    .filter(Boolean)
    .map((word) => Array.from(word)[0])
    .join('')
    .toLocaleUpperCase('vi-VN');
}

export function AccountAvatar({
  name,
  avatarUrl,
  size = 'small',
}: {
  name: string;
  avatarUrl?: string | null;
  size?: 'small' | 'large';
}) {
  const fallback = initials(name);
  return (
    <span className={`account-avatar account-avatar-${size}`} aria-hidden="true">
      {avatarUrl ? (
        // The API validates image signatures and serves each upload under a unique immutable URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" />
      ) : fallback ? (
        fallback
      ) : (
        <UserRound size={size === 'large' ? 34 : 17} />
      )}
    </span>
  );
}
