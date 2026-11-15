import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="container empty">
      <h1>Chưa tìm thấy trang này.</h1>
      <p>Ghé cửa hàng để chọn những món bạn cần nhé.</p>
      <Link className="button" href="/">
        Về cửa hàng
      </Link>
    </div>
  );
}
