'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container empty">
      <h1>Trang đang gặp chút gián đoạn.</h1>
      <p>Bạn có thể tải lại mà không phải gửi lại thao tác đặt hàng.</p>
      <button className="button" onClick={reset}>
        Tải lại trang
      </button>
    </div>
  );
}
