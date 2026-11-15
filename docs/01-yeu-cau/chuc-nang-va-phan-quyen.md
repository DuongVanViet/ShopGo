# Chức năng và phân quyền

## Danh mục yêu cầu

| Mã | Chức năng | Quy tắc chính | Giai đoạn |
| --- | --- | --- | --- |
| FR-01 | Đăng nhập và phiên | OTP có hạn dùng, giới hạn thử/gửi, không ghi mã vào log | MVP |
| FR-02 | Chọn cửa hàng | Hiển thị giờ mở cửa, địa chỉ, slot; từ chối định vị vẫn chọn thủ công | MVP |
| FR-03 | Danh mục và tìm kiếm | Lọc danh mục/giá/còn hàng theo store; chỉ bán SKU đang hoạt động | MVP |
| FR-04 | Giỏ và mua lại | Kiểm tra lại giá/tồn khi checkout; mua lại phải lập giỏ mới | Giỏ MVP, mua lại mở rộng |
| FR-05 | Checkout | Tính tiền phía server; giữ tồn và suất slot nguyên tử | MVP |
| FR-06 | Thanh toán | Không tin trang redirect của khách; xác nhận bằng dữ liệu server đã kiểm chứng | MVP |
| FR-07 | Vòng đời đơn | Chỉ cho phép chuyển trạng thái theo state machine và vai trò | MVP |
| FR-08 | Soạn hàng | Một người nhận soạn chủ động tại một thời điểm; quét SKU và đối chiếu số lượng | MVP |
| FR-09 | Nhận tại quầy | QR dùng một lần, đúng cửa hàng, đúng đơn READY và điều kiện thanh toán | MVP |
| FR-10 | Sản phẩm và tồn | Điều chỉnh có lý do, người thực hiện, sổ biến động; cấm tồn âm | MVP |
| FR-11 | Voucher | Có hạn dùng, đối tượng, mức tối thiểu, quota; server quyết định đủ điều kiện | MVP cơ bản |
| FR-12 | Báo cáo | Tách tiền đã thu, hoàn, doanh thu đơn hoàn tất; lọc theo cửa hàng/ngày | MVP |
| FR-13 | Thông báo | Không ảnh hưởng giao dịch đơn khi nhà cung cấp gửi lỗi; thử lại có giới hạn | MVP |
| FR-14 | Giao hàng | Phân shipper, nhận/từ chối, theo dõi, ảnh/OTP, COD và đối soát | Mở rộng |
| FR-15 | Đổi trả và hỗ trợ | Gắn yêu cầu vào đơn, lưu bằng chứng, người duyệt và lịch sử hoàn | MVP thủ công, mở rộng tự động |
| FR-16 | Điểm và đánh giá | Điểm theo đơn hoàn tất, trừ khi hoàn; đánh giá từ người mua thật | Mở rộng |
| FR-17 | AI | 11 nhóm tính năng được đặc tả ở docs/06-ai; có fallback | MVP giới hạn và mở rộng |
| FR-18 | Cấp tài khoản nhân viên | Public signup chỉ có USER/SELLER; MANAGER cấp PICKER/COUNTER trong store, admin hệ thống được cấp thêm MANAGER; mọi thao tác có audit | MVP |

## Ma trận quyền

Quyền phải kiểm tra ở backend theo vai trò, hành động và phạm vi dữ liệu. Ẩn nút trên giao diện không thay thế kiểm tra quyền.

| Hành động | Khách | Picker | Counter | Quản lý cửa hàng | Shipper | Admin hệ thống |
| --- | --- | --- | --- | --- | --- | --- |
| Xem/sửa giỏ, đặt đơn | Của mình | — | — | — | — | — |
| Xem đơn | Của mình | Được phân công | Chờ nhận tại store | Trong store | Được phân công | Theo quyền hỗ trợ được cấp |
| Nhận soạn, cập nhật dòng soạn | — | Trong store/được phân công | — | Trong store/phân công lại có lý do | — | Theo store đang chọn |
| Xác nhận bàn giao | — | — | Trong store | Trong store | — | Theo store đang chọn |
| Điều chỉnh tồn/giá | — | — | — | Trong store | — | Cấu hình/chính sách toàn hệ thống |
| Duyệt hủy/hoàn ngoại lệ | Gửi yêu cầu | Báo thiếu | — | Trong hạn mức được cấp | — | Theo hạn mức được cấp |
| Cập nhật chuyến giao | — | — | — | Theo dõi trong store | Được phân công | — |
| Quản lý tài khoản nhân sự | — | — | — | Trong store, không nâng quá quyền mình | — | Toàn hệ thống |
| Xem báo cáo | Đơn cá nhân | Hiệu suất cá nhân | — | Trong store | Đối soát cá nhân | Tổng hợp theo quyền |

## Quy tắc quyền bổ sung

- Một nhân viên có thể giữ nhiều vai trò thông qua membership tại từng cửa hàng. Mọi truy vấn đơn/tồn phải áp store scope từ quyền đã xác minh.
- Không cho khách đọc đơn người khác bằng cách đoán UUID. Các endpoint AI tra đơn dùng cùng cơ chế ownership.
- Admin hệ thống được truy cập nghiệp vụ Manager/Picker/Counter theo store đang chọn; MANAGER kế thừa Picker/Counter. Mọi thao tác nhạy cảm vẫn phải ghi audit và giữ store scope.
- PICKER/COUNTER không được tự đăng ký dưới loại STAFF, cấp tài khoản, nâng quyền hoặc thao tác nhân sự của cửa hàng khác.
- Thay vai trò, vô hiệu tài khoản, điều chỉnh tồn, hoàn tiền và thay giá phải có audit event; không cho sửa lịch sử trực tiếp.
- Đăng xuất hoặc khóa tài khoản phải thu hồi refresh session. Thời gian hiệu lực access token là cấu hình cần chốt.
- Dữ liệu địa chỉ/SĐT chỉ hiển thị ở mức đủ để hoàn thành công việc; shipper chỉ có quyền trong khoảng thời gian thực hiện nhiệm vụ.
