# ADR-0003: Kiến trúc đích event-driven và lộ trình tách dịch vụ

Trạng thái: Đề xuất. Ngày: 12/11/2026. Người duyệt: Chưa xác định.

## Bối cảnh

Định hướng dự án là microservices + event-driven trên cloud với nhiều loại client, AI và analytics. ADR-0001 chọn modular monolith để bắt đầu MVP. Cần ghi rõ kiến trúc đích, ranh giới dữ liệu và thời điểm không còn dùng được transaction chung.

## Quyết định đề xuất

1. Giữ ADR-0001 cho MVP; thiết kế module theo User/Auth, Catalog, Inventory, Order, Payment, Fulfillment, Delivery, Promotion/Loyalty, Notification và AI Gateway.
2. Dùng domain events có envelope/version, transactional outbox, consumer dedup, retry/DLQ và trace correlation. MVP có thể xử lý bằng worker; broker liên dịch vụ lựa chọn Kafka hoặc RabbitMQ qua PoC trước tách.
3. API Gateway là điểm vào chung khi có nhiều dịch vụ; xác thực tại gateway và kiểm tra quyền tài nguyên tại service, dùng danh tính riêng giữa các service.
4. Tách consumer phụ trước, rồi dịch vụ đọc hoặc delivery khi có nhu cầu đo được. Không tách nhóm checkout chỉ vì đã có tên module.
5. Mỗi service tách ra sở hữu DB/schema và migration của mình; không ghi trực tiếp bảng service khác. Quy tắc migration tập trung trong ADR-0001 chỉ áp dụng schema backend chưa tách.
6. Trước tách Order/Inventory/Fulfillment/Promotion phải thiết kế và nghiệm thu saga reserve/commit/release, payment late/duplicate và recovery handover. API bất đồng bộ phải có hợp đồng operation/status rõ.
7. Search/vector/warehouse là bản chiếu; không dùng chúng để xác nhận tồn, tiền hoặc quyền. Pipeline sự kiện có kiểm tra schema, dedup và kiểm soát dữ liệu cá nhân.

## Phương án cân nhắc

Tách ngay mọi service làm tăng khối lượng vận hành và nguy cơ sai giao dịch khi chưa có saga. Giữ monolith vĩnh viễn giảm số hệ thống nhưng không phản ánh mục tiêu nhiều team, tải AI/analytics và nhu cầu triển khai độc lập. Chọn broker ngay mà không PoC có thể dẫn tới chi phí vận hành không phù hợp.

## Hệ quả và kiểm chứng

Có lộ trình phát triển nhất quán từ MVP đến kiến trúc đích, đổi lại phải duy trì hợp đồng và ownership rõ ngay từ đầu. Tách dịch vụ cần dashboard lag, DLQ, reconciliation, contract versioning và rollback/cutover. Kiểm chứng bằng crash giữa publish/ACK, event lặp/đảo thứ tự, replay không tạo tác dụng tiền lặp, saga compensation và chạy đối soát sau chuyển dữ liệu.

ADR này bổ sung phạm vi tương lai của ADR-0001, không thay đổi trạng thái đơn công khai hay cấu hình repo hiện tại. Broker, cloud và API Gateway cụ thể vẫn chưa được chọn.

Liên quan: [Microservices và sự kiện](../02-kien-truc/microservices-va-su-kien.md), [Công nghệ](../02-kien-truc/cong-nghe-de-xuat.md), [ADR-0001](0001-kien-truc-va-nguon-du-lieu.md).
