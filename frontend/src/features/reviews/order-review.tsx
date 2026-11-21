'use client';

import { useState, type FormEvent } from 'react';
import { Star } from 'lucide-react';
import { ErrorBox, Loading } from '@/components/ui';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { useShop } from '@/store/shop';
import type { StoreReview } from '@/types';
import { ratings, RatingStars } from './rating-stars';

export function OrderReview({ orderId }: { orderId: string }) {
  const path = `/orders/${orderId}/review`;
  const resource = useResource<{ review: StoreReview | null }>(path);
  const [editing, setEditing] = useState(false);
  const review = resource.data?.review;

  return (
    <section className="panel order-review" aria-labelledby="order-review-title">
      <h2 id="order-review-title">Đánh giá cửa hàng</h2>
      <ErrorBox error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data && <Loading label="Đang tải đánh giá…" />}
      {resource.data &&
        (review && !editing ? (
          <div className="review-entry">
            <RatingStars rating={review.rating} />
            {review.comment && <p className="review-comment">{review.comment}</p>}
            <button type="button" className="text-button" onClick={() => setEditing(true)}>
              Sửa đánh giá
            </button>
          </div>
        ) : (
          <ReviewForm
            path={path}
            review={review}
            onCancel={review ? () => setEditing(false) : undefined}
            onSave={(saved) => {
              resource.updateData(() => ({ review: saved }));
              setEditing(false);
            }}
          />
        ))}
    </section>
  );
}

function ReviewForm({
  path,
  review,
  onSave,
  onCancel,
}: {
  path: string;
  review?: StoreReview | null;
  onSave: (review: StoreReview) => void;
  onCancel?: () => void;
}) {
  const { token, notice } = useShop();
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !rating) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api<StoreReview>(path, {
        method: 'PUT',
        token,
        body: { rating, comment },
      });
      onSave(saved);
      notice(review ? 'Đã cập nhật đánh giá.' : 'Cảm ơn bạn đã đánh giá cửa hàng.');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <fieldset className="review-rating-field" disabled={busy}>
        <legend>Chọn số sao</legend>
        <div className="review-stars review-star-picker">
          {ratings.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="rating"
                aria-label={`${value} sao`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                required
              />
              <Star size={25} fill={value <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Nhận xét (tùy chọn)
        <textarea
          rows={3}
          maxLength={500}
          value={comment}
          disabled={busy}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Chia sẻ trải nghiệm nhận hàng của bạn"
        />
      </label>
      <small className="muted">
        Điểm sao và nhận xét sẽ hiển thị công khai trên trang cửa hàng.
      </small>
      <ErrorBox error={error} />
      <div className="review-actions">
        <button type="submit" className="button small" disabled={!rating || busy}>
          {busy ? 'Đang lưu…' : review ? 'Lưu đánh giá' : 'Gửi đánh giá'}
        </button>
        {onCancel && (
          <button type="button" className="text-button" disabled={busy} onClick={onCancel}>
            Hủy
          </button>
        )}
      </div>
    </form>
  );
}
