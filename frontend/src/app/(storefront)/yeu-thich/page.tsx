import type { Metadata } from 'next';
import { FavoritesView } from '@/features/favorites/favorites-view';

export const metadata: Metadata = { title: 'Yêu thích' };

export default function Page() {
  return <FavoritesView />;
}
