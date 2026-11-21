'use client';

import { useState } from 'react';
import { ArrowRight, Star } from 'lucide-react';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { useResource } from '@/hooks/use-resource';
import { query } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { Page, StoreReview } from '@/types';
import { RatingStars } from './rating-stars';

interface ReviewPage extends Page<StoreReview> {
  summary: { average: number | null; count: number };
}

const averageFormat = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function StoreReviews({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState('');
  const path = `/stores/${storeId}/reviews`;
  const firstPage = useResource<ReviewPage>(`${path}?limit=5`, 30000);
  const nextPage = useResource<ReviewPage>(
    cursor ? `${path}?${query({ limit: 5, cursor })}` : null,
    30000,
  );
  const reviews = cursor ? nextPage : firstPage;
  const summary = firstPage.data?.summary;

  return (
    <section className="panel store-reviews" aria-label="Đánh giá cửa hàng">
      <div className="store-reviews-heading">
        <span className="store-reviews-icon" aria-hidden="true">
          <Star size={22} fill="currentColor" />
        </span>
        <div>
          <h2>Đánh giá về {storeName}</h2>
          {summary && (
            <p className="muted">
              {summary.average === null ? (
                'Chưa có đánh giá'
              ) : (
                <>
                  <strong>{averageFormat.format(summary.average)}/5</strong>
                  {' · '}
                  {summary.count} lượt đánh giá
                </>
              )}
            </p>
          )}
        </div>
        {!!summary?.count && (
          <button type="button" className="button secondary small" onClick={() => setOpen(true)}>
            Xem đánh giá <ArrowRight size={15} />
          </button>
        )}
      </div>
      {!open && <ErrorBox error={firstPage.error} retry={firstPage.refresh} />}
      {!open && firstPage.loading && !summary && <Loading label="Đang tải đánh giá…" />}
      <Modal
        title={`Đánh giá về ${storeName}`}
        open={open}
        onClose={() => {
          setOpen(false);
          setCursor('');
        }}
      >
        <div className="review-list">
          <ErrorBox error={reviews.error} retry={reviews.refresh} />
          {reviews.loading && !reviews.data && <Loading label="Đang tải đánh giá…" />}
          {reviews.data?.items.map((review) => (
            <article key={review.id} className="review-entry">
              <div className="review-entry-header">
                <strong>Khách đã nhận hàng</strong>
                <time className="muted" dateTime={review.createdAt}>
                  {dateTime(review.createdAt)}
                </time>
              </div>
              <RatingStars rating={review.rating} />
              {review.comment && <p className="review-comment">{review.comment}</p>}
            </article>
          ))}
          <div className="review-actions">
            {cursor && (
              <button type="button" className="text-button" onClick={() => setCursor('')}>
                Về trang đầu
              </button>
            )}
            {reviews.data?.nextCursor && (
              <button
                type="button"
                className="button secondary small"
                disabled={reviews.loading}
                onClick={() => setCursor(reviews.data!.nextCursor!)}
              >
                Xem thêm đánh giá
              </button>
            )}
          </div>
        </div>
      </Modal>
    </section>
  );
}
