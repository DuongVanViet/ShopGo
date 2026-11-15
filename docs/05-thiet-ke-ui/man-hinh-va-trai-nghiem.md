# Màn hình và trải nghiệm

## Cấu trúc điều hướng

Frontend dùng các route group `(storefront)`, `(picker)`, `(counter)`, `(admin)` đã tạo. Route group chỉ tổ chức mã; đường dẫn URL thực tế cần định nghĩa tránh xung đột. Shipper có nhóm route riêng khi triển khai delivery. UI chung nằm ở components/ui, layout và chat-widget khi bắt đầu xây component.

Điều hướng chính được lọc theo quyền ngay khi render. Khách/anonymous chỉ có **Cửa hàng** và **Đơn của tôi**; Picker chỉ có **Soạn hàng**; Counter chỉ có **Quầy nhận**; Seller/Manager có Soạn hàng, Quầy nhận và Quản lý cửa hàng. Admin chưa chọn store chỉ có **Quản trị**; sau khi chọn store quản trị mới mở thêm ba mục vận hành. MANAGER kế thừa Picker/Counter, nhưng nhân viên không thấy màn hình ngoài vai trò được cấp.

| Nhóm | Màn hình | Nội dung và hành động |
| --- | --- | --- |
| Khách | Chọn cửa hàng | USER đăng nhập chọn **Tất cả cửa hàng** hoặc một store; store cụ thể có địa chỉ, ghim và chỉ đường nếu có tọa độ |
| Khách | Trang chủ/danh mục | Mặc định là feed offer của mọi cửa hàng; khi chọn/vào một store thì chỉ hiện catalog, giá và tồn của store đó |
| Khách | Chi tiết SKU | Ảnh, đơn vị, giá, tồn khả dụng và cửa hàng bán; ở feed tổng có nút **Vào cửa hàng này** trước khi thêm giỏ |
| Khách | Giỏ | Sửa số lượng, xóa, tổng tạm tính, nhãn giá thay đổi/hết hàng, mở trợ lý |
| Khách | Checkout | Slot, phương thức nhận/trả tiền, voucher, breakdown server, xác nhận cuối |
| Khách | Chờ thanh toán | Đồng hồ hết hạn theo expiresAt server, tiếp tục trả tiền, tải lại trạng thái, hủy |
| Khách | Theo dõi đơn | Timeline, slot, phương thức, mã đơn, QR khi READY, hỗ trợ |
| Khách | Tài khoản/đơn cũ | Hồ sơ, danh sách đơn; mua lại, điểm, đánh giá bổ sung sau MVP |
| Khách | Hỗ trợ | Chọn đơn, vấn đề, mô tả, trạng thái ticket; đổi trả không hứa duyệt ngay |
| Picker | Danh sách đơn | Đơn đủ điều kiện, slot và độ ưu tiên, nút nhận; lọc việc của tôi |
| Picker | Soạn đơn | SKU/ảnh/kệ/số lượng, quét hoặc nhập mã, báo thiếu; chốt READY khi đủ |
| Counter | Nhận hàng | Mở camera hoặc nhập token, preview đơn, xác nhận người nhận, thu tiền nếu cần, bàn giao |
| Manager | Dashboard | Đơn theo trạng thái, slot sắp đến, cảnh báo thiếu hàng, doanh thu và tiền thu/hoàn |
| Manager | Tồn/giá/khuyến mãi | Lọc SKU, tồn vật lý/giữ/có thể bán, điều chỉnh có lý do, xem lịch sử |
| Admin | Cửa hàng và quyền | Chi nhánh, membership, quyền nhạy cảm, audit và báo cáo tổng hợp |
| Shipper — mở rộng | Nhiệm vụ/chuyến | Nhận/từ chối, tuyến, địa chỉ tối thiểu, OTP/ảnh, COD, sự cố |

### Khám phá sản phẩm đa cửa hàng

Khi chưa chọn store, catalog tải các offer từ mọi cửa hàng và coi `(storeId, skuId)` là định danh hiển thị; cùng một SKU có thể xuất hiện nhiều lần với giá/tồn khác nhau. Thẻ và modal phải ghi rõ tên, địa chỉ cửa hàng. Hành động **Vào cửa hàng này** chọn store tương ứng, đưa khách về vùng sản phẩm và thay feed tổng bằng catalog của store; nút thêm giỏ chỉ xuất hiện trong ngữ cảnh một store để không trộn giỏ giữa các cửa hàng.

Chọn lại **Tất cả cửa hàng** xóa ngữ cảnh store và giỏ đang hiển thị. Bộ chọn này chỉ dành cho USER đã đăng nhập; khách chưa đăng nhập và tài khoản Seller/Staff/Admin không thấy khối nhận hàng của khách. Seller/Staff dùng store sở hữu hoặc membership, còn Admin dùng bộ chọn quản trị riêng.

## Wireframe chữ — checkout trên mobile

```text
[Cửa hàng đã chọn] [Đổi]
Nhận tại cửa hàng
[Ngày] [Khung giờ còn suất]
Sản phẩm (x dòng)          Xem chi tiết
[Nhập voucher]             Áp dụng
Tạm tính                  280.000đ
Giảm                       20.000đ
Phí                             0đ
Tổng                      260.000đ
( ) Trả khi nhận  ( ) Thanh toán online
[Xác nhận đặt hàng • 260.000đ]
```

Các con số chỉ là dữ liệu minh họa. Nút xác nhận khóa trong lúc gửi; retry giữ cùng idempotency key. Hết tồn/slot hiển thị dòng bị ảnh hưởng, giữ lại dữ liệu người dùng và cho chọn lại. Không thông báo đặt thành công trước response server.

## Trạng thái bắt buộc cho từng trang

Loading có skeleton/nhãn; empty có hành động tiếp theo; error có thông báo dễ hiểu và requestId để hỗ trợ; offline có thời điểm đồng bộ cuối; phiên hết hạn cho đăng nhập lại và khôi phục ngữ cảnh. Không hiển thị tồn cũ như cam kết còn hàng khi mất mạng.

QR hiển thị như dữ liệu nhạy cảm, không đưa vào URL analytics. Counter lookup chưa bàn giao; nút cuối hiển thị mã đơn, số món và tình trạng tiền. Nếu đã thu tại quầy nhưng lỗi mạng khi bàn giao, tải trạng thái và tiếp tục, không yêu cầu thu lại.

## Trợ lý và sự xác nhận

Chat hiển thị các giả định về số người/ngân sách, thẻ SKU có giá thật và tổng proposal. Dùng nút “Thêm các món đã chọn vào giỏ” với preview; không biến câu trả lời tự nhiên thành đặt đơn. Khi tồn/giá đổi, yêu cầu xem lại proposal mới. Chính sách đổi trả có tên tài liệu, phiên bản và đường dẫn người dùng được phép xem.

## Nguyên tắc tiếp cận và đo lường

Màu trạng thái luôn kèm chữ/icon; focus rõ, nhãn input, báo lỗi gần trường, thông báo screen reader cho cập nhật giỏ. Camera bị từ chối có nhập mã thủ công và quy trình xác minh. Theo dõi sự kiện store_selected, search_submitted, add_to_cart, checkout_started, order_created, payment_verified, order_completed; tránh ghi nội dung chat, QR và thông tin cá nhân vào analytics.
