# ADR-0002: Click & Collect trước và AI có kiểm soát

Trạng thái: Đề xuất. Ngày: 12/11/2026. Người duyệt: Chưa xác định.

## Bối cảnh

Tổng quan có cả bán hàng, vận hành cửa hàng, giao hàng và 11 tính năng AI. Triển khai cùng lúc đòi hỏi dữ liệu lộ trình, giao nhận, COD, hành vi và lô hàng chưa sẵn có. AI tạo nội dung không có quyền bảo đảm tồn, giá hay ý định thanh toán của khách.

## Quyết định đề xuất

MVP ưu tiên Click & Collect, trả tại quầy và một cổng online; đủ chuỗi giữ tồn → xác nhận → soạn → READY → bàn giao. Delivery và mô hình AI nâng cao đi sau pilot, có đặc tả và dữ liệu riêng.

AI MVP gồm gợi ý giỏ từ SKU thật và FAQ/tra cứu có giới hạn. Tools đọc dữ liệu theo scope; thay giỏ thông qua proposal gắn phiên bản và xác nhận UI. Không cấp cho model quyền đặt đơn, thu/hoàn tiền, điều chỉnh tồn hoặc bàn giao. Checkout/thu tiền luôn qua backend nghiệp vụ và thao tác được xác minh.

## Phương án cân nhắc

Phát hành đầy đủ đa kênh ngay tăng độ phủ nhưng làm khó kiểm thử nghiệp vụ tiền/tồn và phụ thuộc nhân sự vận hành giao hàng. Trợ lý tự động làm mọi việc giảm số click nhưng khó chứng minh sự đồng ý và tăng tác động khi prompt hoặc dữ liệu sai. Chỉ dùng tìm kiếm truyền thống giảm độ phức tạp nhưng không kiểm chứng được giá trị lập giỏ; vì vậy giữ AI như năng lực phụ có fallback.

## Hệ quả và kiểm chứng

Pilot có phạm vi rõ, cần thông báo trung thực phần chưa hỗ trợ; không có shipper/delivery thật trong MVP. Phải có fallback khi AI lỗi, dataset regression và log tool đã che dữ liệu. Giá trị AI đo bằng proposal hợp lệ/được dùng, thay vì chỉ đo số tin nhắn. Kiểm chứng qua US-14..15, TC-25..29 và tiêu chí AI eval; cân nhắc mở rộng khi gate và dữ liệu đạt yêu cầu.

Liên quan: [Phạm vi](../01-yeu-cau/tong-quan-va-pham-vi.md), [Agent và công cụ](../06-ai/agent-va-cong-cu.md), [Lộ trình](../07-ke-hoach/lo-trinh-va-backlog.md).
