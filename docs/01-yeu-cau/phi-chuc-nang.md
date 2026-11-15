# Yêu cầu phi chức năng

Các mức dưới đây là mục tiêu đề xuất cho pilot, chưa phải SLA cam kết với khách.

| Mã | Nhóm | Mục tiêu và cách kiểm chứng |
| --- | --- | --- |
| NFR-01 | Tốc độ đọc | p95 API danh mục/tìm kiếm ≤ 800 ms tại 50 request/giây trong 15 phút, dữ liệu thử 10 store/10.000 SKU; tách thời gian phụ thuộc ngoài |
| NFR-02 | Checkout | p95 tạo đơn ≤ 2 giây tại 10 checkout/giây; không bao gồm thời gian khách thao tác/cổng thanh toán |
| NFR-03 | Nhất quán | 0 tồn khả dụng âm, 0 bàn giao trùng, 0 cập nhật thanh toán trùng trong bộ stress và fault test |
| NFR-04 | Sẵn sàng | Mục tiêu pilot 99,5%/tháng cho đường đặt/nhận đơn; đo synthetic check, thống nhất cách tính bảo trì trước công bố |
| NFR-05 | Phục hồi | RPO ≤ 24 giờ, RTO ≤ 4 giờ cho pilot; diễn tập phục hồi dữ liệu và đối soát tiền phát sinh sau điểm backup |
| NFR-06 | Truy vết | Mỗi request có requestId; xuyên suốt đơn, payment, worker và AI; log không chứa OTP/token hay thông tin nhạy cảm nguyên bản |
| NFR-07 | Truy cập | Kiểm tra quyền theo resource/store/owner cho mọi API riêng tư; test truy cập chéo vai trò và cửa hàng |
| NFR-08 | UX | Dùng được trên màn hình rộng 360px, thao tác bàn phím, nhãn form, trạng thái không chỉ dùng màu; xác minh QR có fallback thủ công có kiểm soát |
| NFR-09 | AI | Đường tư vấn có timeout cấu hình, mục tiêu p95 ≤ 8 giây cho ca đơn giản; timeout không chặn giỏ/checkout |
| NFR-10 | Tương thích | Thử trên trình duyệt desktop/mobile được nhóm chọn; camera và push chỉ bật khi hỗ trợ, có phương án thay thế |

## Bảo mật và riêng tư theo thiết kế

- TLS ở môi trường triển khai; secret được cấp qua cơ chế quản lý bí mật của môi trường, không commit vào repo.
- OTP, login, tìm kiếm và AI có rate limit theo tài khoản/IP theo từng mức rủi ro. Không log nội dung xác thực.
- Password của nhân sự nếu dùng phải được băm phù hợp; giải pháp xác thực nhân sự cần chốt trước triển khai FR-01.
- Không lưu số thẻ/CVV; tích hợp thanh toán theo token/redirect do cổng hỗ trợ sau khi kiểm tra hợp đồng kỹ thuật.
- Dữ liệu cá nhân thu theo nhu cầu nghiệp vụ; vị trí chính xác và nội dung hội thoại không mặc định gửi tới mô hình.
- Thời hạn lưu/xóa SĐT, địa chỉ, bằng chứng giao, hội thoại và audit cần được chủ dự án duyệt dựa trên yêu cầu thực tế trước pilot.
- Mọi thao tác làm thay đổi đơn, tồn hoặc tiền có bản ghi người thực hiện, nguồn thao tác và thời điểm.

## Khả năng bảo trì

Module giao tiếp qua service interface rõ ràng; thay đổi schema bằng migration có version; hợp đồng API kiểm tra với frontend; cấu hình môi trường được kiểm tra khi khởi động. Chỉ số lỗi cần tách lỗi người dùng, hết tồn, lỗi hệ thống và lỗi nhà cung cấp để tránh cảnh báo sai.
