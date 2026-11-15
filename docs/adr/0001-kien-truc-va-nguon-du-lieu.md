# ADR-0001: Modular monolith và nguồn dữ liệu giao dịch

Trạng thái: Đề xuất. Ngày: 12/11/2026. Người duyệt: Chưa xác định.

## Bối cảnh

Checkout cần giữ đồng thời tồn, slot, quota voucher và đơn. Đội ngũ, lưu lượng và hạ tầng chưa được xác định; vận hành nhiều microservice ngay làm tăng số giao dịch phân tán trước khi có nhu cầu thực tế. Repo có cả `database/` và `backend/src/database/`, cần một nơi sở hữu migration ứng dụng để tránh lệch schema.

## Quyết định đề xuất

- Backend NestJS modular monolith, module có service interface; worker triển khai tiến trình riêng khi cần.
- PostgreSQL là nguồn chuẩn của đơn, tồn, tiền và quyền; Redis phục vụ cache/queue, không là nơi giữ duy nhất reservation.
- Checkout dùng transaction DB; xử lý tích hợp ngoài qua outbox/inbox và handler idempotent.
- AI service Python tách runtime, chỉ thao tác nghiệp vụ qua backend tools có quyền.
- Migration ứng dụng duy nhất nằm tại `backend/src/database`. `database/schema` chứa ERD/tài nguyên tham khảo; tài nguyên SQL triển khai thật phải được tích hợp vào migration có version, không chạy song song một lịch sử khác.
- ORM chọn sau spike theo D06, không duy trì cả Prisma và TypeORM cho cùng schema.

Phạm vi quyết định trên là MVP modular monolith. Đích microservices + event-driven, ownership DB/migration sau tách và yêu cầu saga được bổ sung ở [ADR-0003](0003-tach-dich-vu-va-hop-dong-su-kien.md); không dùng transaction chung xuyên các DB đã độc lập.

## Phương án cân nhắc

Microservice mỗi nghiệp vụ cho phép deploy độc lập nhưng cần bù trừ và observability phức tạp hơn cho MVP. AI chung tiến trình backend giảm một kết nối nhưng gây phụ thuộc runtime và khó cách ly tải. Reservation chỉ trong Redis đơn giản về TTL nhưng khó đối soát khi cache/hàng đợi mất dữ liệu.

## Hệ quả và kiểm chứng

Giao dịch cốt lõi dễ giữ nhất quán và triển khai ban đầu gọn hơn. Module vẫn phải có ownership rõ để tránh phụ thuộc vòng; DB là điểm cần đo tải/backup. Kiểm chứng bằng TC-06..12, TC-20, TC-23 và TC-31..32. Xem xét tách dịch vụ khi có tải đo được, nhóm sở hữu độc lập hoặc nhu cầu triển khai khác biệt.

Liên quan: [Kiến trúc hệ thống](../02-kien-truc/kien-truc-he-thong.md), [Mô hình dữ liệu](../03-co-so-du-lieu/mo-hinh-du-lieu.md).
