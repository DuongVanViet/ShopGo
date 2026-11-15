'use client';
import Link from 'next/link';
import { ArrowRight, ClipboardList, ScanLine, ShoppingBag } from 'lucide-react';
import { useShop } from '@/store/shop';
import { PageTitle } from '@/components/ui';
export default function Page() {
  const shop = useShop();
  return (
    <div className="container">
      <PageTitle
        eyebrow="TỪ MỘT GIỎ HÀNG ĐẾN MỘT LẦN NHẬN GỌN"
        title="Thử ShopGo trong một vòng đơn."
        subtitle="Dùng tài khoản mẫu để trải nghiệm các vai trò. Các thao tác thành công sẽ thay đổi dữ liệu thật trong môi trường local của bạn."
      />
      <div className="guide-steps">
        {[
          {
            n: '01',
            title: 'Mua như một khách hàng',
            text: 'Đăng nhập Khách hàng, thêm món, chọn giờ và xác nhận đặt trả tiền khi nhận.',
            href: '/',
            link: 'Đi mua sắm',
            icon: ShoppingBag,
          },
          {
            n: '02',
            title: 'Soạn từng món trong đơn',
            text: 'Chuyển tài khoản Soạn hàng, nhận đơn, nhập mã hàng hiển thị và xác nhận đủ các món.',
            href: '/soan-hang',
            link: 'Đến khu soạn',
            icon: ClipboardList,
          },
          {
            n: '03',
            title: 'Nhận hàng tại quầy',
            text: 'Đăng nhập lại Khách hàng để lấy QR. Sao chép mã, chuyển Quầy nhận, ghi thu tiền và bàn giao.',
            href: '/nhan-hang',
            link: 'Đến quầy nhận',
            icon: ScanLine,
          },
        ].map((step) => (
          <article className="guide-step" key={step.n}>
            <span>{step.n}</span>
            <step.icon size={28} style={{ marginTop: 12, color: '#6c8550' }} />
            <h2>{step.title}</h2>
            <p>{step.text}</p>
            <Link href={step.href} className="text-button">
              {step.link}
              <ArrowRight size={15} />
            </Link>
          </article>
        ))}
      </div>
      <div className="spacer" />
      <section className="panel">
        <h2 style={{ fontSize: 23 }}>Muốn thử thêm dữ liệu?</h2>
        <p className="muted" style={{ margin: '14px 0 20px' }}>
          Admin có thể tạo sản phẩm, danh mục, cửa hàng và voucher. Quản lý có thể chỉnh tồn, giá và
          mở khung giờ nhận trong tương lai. Tài khoản hiện tại chỉ được thao tác trong phạm vi được
          cấp.
        </p>
        <div className="row wrap">
          {process.env.NEXT_PUBLIC_DEMO_MODE !== 'false' && (
            <button className="button" onClick={shop.openDemoAuth}>
              Chọn tài khoản mẫu
            </button>
          )}
          <Link className="button secondary" href="/he-thong">
            Thêm dữ liệu
          </Link>
          <Link className="button secondary" href="/quan-ly">
            Quản lý cửa hàng
          </Link>
          <Link className="text-button" href="/tro-ly">
            Thử đề xuất giỏ <ArrowRight size={15} />
          </Link>
        </div>
      </section>
      <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
        Phiên đăng nhập được giữ trong bộ nhớ của tab; tải lại trang cần đăng nhập lại. Khi chuyển
        cửa hàng, giỏ được hiển thị riêng cho cửa hàng đó. Chỉ dùng tài khoản mẫu trong môi trường
        thử nghiệm.
      </p>
    </div>
  );
}
