# ShopGo Frontend

Next.js App Router + React + TypeScript + Tailwind, kết nối backend NestJS hiện có. Chạy local tại `http://localhost:3000`. Giao diện không dùng danh sách sản phẩm giả khi backend lỗi.

## Chạy trên máy hiện tại

PostgreSQL phải chạy và backend đã migrate/seed theo [hướng dẫn backend](../backend/README.md). Mở các terminal riêng, dùng launcher `.cmd` để không gặp chính sách chặn `.ps1` của PowerShell.

Terminal backend, nếu chưa chạy:

```powershell
& "C:\Users\vanvi\ShopGo\scripts\backend.cmd" dev
```

Terminal frontend — bản production đã build, phù hợp thử toàn bộ luồng:

```powershell
& "C:\Users\vanvi\ShopGo\scripts\frontend.cmd" start
```

Mở **http://localhost:3000**. Muốn tự sửa giao diện với hot reload thì dùng `frontend.cmd dev` thay cho `start`; không chạy hai chế độ trên cùng port. Trong dev, đổi mã hoặc tải lại toàn trang có thể làm mất phiên đăng nhập được giữ trong memory.

Thanh đầu trang có **Đăng nhập** và **Đăng ký** riêng, hiển thị cả trên điện thoại. Đăng nhập từ thanh đầu trang, giỏ hàng, thêm sản phẩm hoặc khi hết phiên đều mở form SĐT/email + mật khẩu. OTP chỉ mở khi chọn rõ **Dùng tài khoản mẫu** trên trang đăng nhập hoặc **Chọn tài khoản mẫu** trong hướng dẫn.

Menu chính được tạo theo quyền, không render các mục trái vai trò: khách/anonymous chỉ thấy **Cửa hàng** và **Đơn của tôi**; Picker chỉ thấy **Soạn hàng**; Counter chỉ thấy **Quầy nhận**; Seller/Manager thấy Soạn hàng, Quầy nhận và Quản lý cửa hàng. Admin luôn thấy **Quản trị** và chỉ thấy ba mục vận hành sau khi chọn một cửa hàng quản trị. Giỏ hàng chỉ xuất hiện trong trải nghiệm khách hàng.

Worker chạy ở terminal khác để xử lý thông báo trong ứng dụng và đơn online hết hạn:

```powershell
& "C:\Users\vanvi\ShopGo\scripts\backend.cmd" worker
```

Khi cài từ checkout mới, chạy `frontend.cmd install`, sau đó `frontend.cmd build` trước `start`. Launcher tự tìm Node portable trong `.tools` nếu có; máy khác cần cài Node 22.14+ và npm. Runtime portable, node_modules, `.next` và secret không được commit.

## Kết nối API

`next.config.mjs` chuyển `/api/v1/*` sang backend qua rewrite cùng origin; mặc định `http://127.0.0.1:3001`. Có thể tạo `frontend/.env.local` từ `.env.example` để thay `BACKEND_URL`, rồi khởi động lại frontend; build lại trước dùng production nếu thay cấu hình rewrite.

Không đưa AUTH_SECRET, payment secret hoặc AI service token vào frontend. Bearer session chỉ nằm trong bộ nhớ tab, không ghi localStorage/sessionStorage; localStorage chỉ lưu ID cửa hàng. Chuyển trang bằng điều hướng trong app giữ phiên; tải lại toàn trang cần đăng nhập lại. Mỗi tab/cửa sổ có thể đăng nhập vai trò khác nhau.

`NEXT_PUBLIC_DEMO_MODE=false` ẩn nút chọn tài khoản mẫu khi build. Nút demo vẫn phải xin và xác minh OTP qua backend; chỉ tự điền khi backend trả `localCode`. Backend production phải tắt OTP local theo thiết kế. Không tự động đăng nhập hay gọi API ghi dữ liệu lúc mở trang.

## Các màn hình

| URL | Chức năng |
| --- | --- |
| `/` | Mặc định xem sản phẩm của tất cả cửa hàng; tìm/lọc, chọn một cửa hàng để thu hẹp catalog, xem chi tiết và thêm giỏ |
| `/register` | Đăng ký user bằng tên + SĐT/email + mật khẩu; seller hai bước thông tin cửa hàng và địa chỉ/ghim |
| `/login` | Đăng nhập SĐT/email + mật khẩu; nút riêng mở demo OTP |
| `/seller/location` | Chủ cửa hàng xem/sửa địa chỉ và tọa độ đã lưu |
| `/gio-hang` | Sửa/xóa số lượng theo version, xem giá hiện tại theo cửa hàng |
| `/thanh-toan` | Slot tương lai, voucher, quote server, đặt trả tiền mặt khi nhận, chống retry tạo trùng |
| `/don-hang` | Đơn cá nhân, lọc trạng thái, cursor pagination |
| `/don-hang/{id}` | Chi tiết/timeline, khung nhận, QR thật, sao chép/cấp lại token, hủy trước soạn và gửi ticket |
| `/soan-hang` | Picker claim, nhập/quét mã theo dạng bàn phím, xác nhận số lượng và READY |
| `/nhan-hang` | Counter nhập token QR, lookup, CASH collection, handover theo version và quyền |
| `/quan-ly` | Seller/Manager/Admin tạo danh mục, sản phẩm và tải ảnh; cấp tài khoản nhân viên; quản lý tồn, giá, đơn, slot và báo cáo |
| `/he-thong` | Admin tạo dữ liệu hệ thống, voucher và cấp membership |
| `/tro-ly` | Danh sách dự kiến có ngân sách, preview và xác nhận apply; chat qua AI Gateway nếu AI service được cấu hình |
| `/huong-dan` | Hướng dẫn trải nghiệm nhiều vai trò |

USER đã đăng nhập có lựa chọn **Tất cả cửa hàng** ở thanh đầu trang. Đây là chế độ mặc định khi chưa chọn cửa hàng và dùng feed public `/products`; chọn một cửa hàng sẽ chuyển catalog sang `/stores/{storeId}/products`. Khách chưa đăng nhập, Seller, Staff và Admin không thấy bộ chọn dành cho khách; tài khoản vận hành vẫn dùng cửa hàng được phân công.

Trong feed tổng, mỗi thẻ/chi tiết sản phẩm hiển thị cửa hàng bán, địa chỉ và nút **Vào cửa hàng này**. Nút này chọn đúng cửa hàng, cuộn về catalog và chỉ khi đó mới cho thêm sản phẩm vào giỏ. Khi đã chọn cửa hàng, header hiển thị địa chỉ; nút **Xem vị trí** mở ghim chỉ đọc trong ShopGo rồi có thể mở đúng tọa độ hoặc chỉ đường trong Google Maps. Cửa hàng chưa lưu tọa độ chỉ hiện địa chỉ, không được tự đặt ghim ước lượng.

Sau khi seller đăng ký, `/quan-ly` mở tab **Danh mục & sản phẩm**. Seller tạo danh mục trước, sau đó nhập tên/mô tả, SKU, barcode tùy chọn, đơn vị, giá bán, tồn ban đầu và một ảnh JPEG/PNG/WebP tối đa 5 MB. Ảnh được xem trước trước khi gửi; có thể bỏ chọn, thay ảnh hoặc tải ảnh lại từ thẻ sản phẩm nếu lần tải đầu gặp lỗi. Backend tạo product, SKU, giá, số dư tồn và lịch sử nhập đầu kỳ trong cùng transaction; ảnh được tải qua endpoint riêng sau khi product đã được tạo.

Tab **Nhân viên** cho phép MANAGER của cửa hàng cấp tài khoản `PICKER` hoặc `COUNTER`; admin hệ thống có thể cấp thêm `MANAGER` và truy cập các màn hình vận hành của store đang chọn. Nhân viên không có lựa chọn đăng ký công khai: họ dùng SĐT/email và mật khẩu ban đầu do cửa hàng cấp. MANAGER kế thừa màn hình soạn hàng/quầy nhận, còn tài khoản nhân viên không thể cấp tài khoản khác.

Quyền UI giúp điều hướng; backend vẫn kiểm tra ownership, store scope và từng hành động. Admin hệ thống có thể vào các màn hình vận hành theo store đang chọn; MANAGER kế thừa Picker/Counter, còn nhân viên không được nâng quyền hay cấp tài khoản. Một đơn thuộc một cửa hàng; đổi cửa hàng trên header hiển thị giỏ riêng, không chuyển hàng âm thầm giữa hai cửa hàng.

## Thử một vòng đơn hoàn chỉnh

1. Bấm **Đăng nhập → Khách hàng**, chọn cửa hàng có hàng và slot, thêm món vào giỏ.
2. Vào giỏ, chọn giờ, nhập voucher tùy chọn, bấm **Xem tổng thanh toán**, rồi **Xác nhận đặt hàng**.
3. Mở cửa sổ/tab khác tại trang chủ, chọn **Đăng nhập → Soạn hàng**, vào **Soạn hàng** và nhận đúng đơn.
4. Nhập mã barcode hiện trên dòng hàng (hoặc máy quét dạng bàn phím), xác nhận số lượng từng dòng rồi bấm **Đã kiểm tra, sẵn sàng nhận**.
5. Quay lại tab khách: trạng thái tự cập nhật; QR xuất hiện khi READY. Sao chép mã bằng nút tương ứng. Có thể dùng một tab và lần lượt đổi tài khoản nếu muốn.
6. Mở tab **Quầy nhận**, dán token vào ô mã, kiểm tra đơn, xác nhận đã thu đúng tiền mặt, rồi xác nhận bàn giao.
7. Tab khách hiển thị hoàn tất; tài khoản **Quản lý** thấy tồn vật lý giảm và lượng giữ được giải phóng. Quản trị tạo thêm SKU mới để thử nhiều tình huống.

Nút Đăng nhập ở header mở `/login`. Để dùng tài khoản mẫu trong quy trình trên, chọn **Dùng tài khoản mẫu**, rồi chọn vai trò. Để dùng tài khoản của mình, tạo ở `/register` và đăng nhập bằng mật khẩu. Tài khoản demo OTP không có mật khẩu mặc định.

Seller nhập tên cửa hàng, SĐT, email, mật khẩu rồi tiếp tục nhập địa chỉ và ghim. Map dùng tọa độ WGS84, GPS hiển thị sai số; có thể nhấp/kéo ghim hoặc nhập tọa độ. Ghim lưu trong ShopGo, không đăng lên OSM. Cần Internet để tải nền bản đồ; dùng localhost hoặc HTTPS cho browser định vị. Tìm địa chỉ tự động/geocoding chưa bật; không gửi địa chỉ form sang dịch vụ tra địa chỉ.

Chi tiết: [Đăng ký, đăng nhập và bản đồ](../docs/05-thiet-ke-ui/dang-ky-dang-nhap-ban-do.md).

Nếu không có slot còn nhận: tài khoản Quản lý → Khung giờ nhận → chọn ngày/giờ **trong tương lai** và không trùng khung hiện có. Nếu hết hàng, bổ sung qua điều chỉnh tồn có lý do. Demo account bị giới hạn OTP 3 lần/10 phút theo backend; giữ tab đang đăng nhập để tránh xin OTP liên tục.

## Lưu ý giao dịch

Các thao tác ghi cần chống lặp dùng Idempotency-Key theo phương thức/URL/payload và phiên. Khóa được giữ khi lỗi mạng/5xx để gửi lại cùng thao tác; UI khóa nút trong khi gửi. Checkout giữ quote khi chưa rõ kết quả, không âm thầm tạo quote mới để thử lại. Giá, tồn, quota và version luôn do backend quyết định.

Đơn/soạn hàng dùng polling và tải lại khi tab trở về foreground. Không hiển thị QR trước READY, không cho handover khi paymentStatus chưa PAID. Chưa hỗ trợ camera scanner, thanh toán online trực tiếp, hoàn tiền qua UI, delivery, loyalty hoặc review. Ảnh do seller tải lên được hiển thị ở thẻ và chi tiết sản phẩm; sản phẩm chưa có ảnh vẫn dùng SVG minh họa. Tên/giá/tồn luôn là dữ liệu API.

AI chat không có câu trả lời dựng sẵn để che lỗi provider. Khi chưa cấu hình AI, tạo danh sách dự kiến thủ công vẫn hoạt động qua API proposal; phải xem và xác nhận mới thêm vào giỏ, không tự checkout.

## Kiểm tra

Trong `frontend`:

```text
npm run typecheck
npm run format:check
npm run build
```

Chrome/Edge E2E dùng Playwright, cần frontend và backend local đang chạy. Mặc định chỉ chạy các ca đọc và báo lỗi kết nối. Để chạy cả ca tạo sản phẩm/đơn/thu tiền/bàn giao:

```powershell
$env:E2E_ALLOW_MUTATIONS = '1'
& "C:\Users\vanvi\ShopGo\scripts\frontend.cmd" test
```

Chỉ bật trên DB thử nghiệm local. Test tạo SKU `E2E-*`, khách có SĐT giả, đơn và lịch sử thao tác; dữ liệu test thành công được giữ lại để đối chiếu, không reset/xóa dữ liệu của bạn. Test thất bại giữa chừng có thể để lại đơn chưa hoàn tất; quản lý có thể xử lý theo quy trình. Không chạy ca ghi trên dữ liệu production. Có thể dùng E2E_BASE_URL khác và PLAYWRIGHT_CHANNEL=msedge nếu dùng Edge. Artifacts/screenshot/trace nằm trong test-results bị Git ignore.

Đã xác minh build production, desktop/mobile, lỗi backend và luồng tạo sản phẩm → checkout → picker → QR → cash → handover → kiểm tra tồn bằng Chrome thật. Backend được bổ sung slot/store/barcode trong response chi tiết đơn và kiểm tra lại regression.
