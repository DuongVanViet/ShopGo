# ADR-0004: Hiện thực backend MVP với PostgreSQL và SQL migrations

Trạng thái: Đã hiện thực cho môi trường local, trong phạm vi yêu cầu xây backend. Ngày: 12/11/2026.

## Bối cảnh

Đặc tả dữ liệu cần CHECK constraint, composite FK, partial unique index, row/advisory locks, lịch sử append-only và kiểm thử đồng thời. Repo chưa có ORM hoặc cấu hình backend. Cổng OTP, thanh toán, AI và hạ tầng queue chưa được chọn.

## Quyết định hiện thực

- NestJS modular monolith, TypeScript, PostgreSQL qua driver `pg`, query có tham số. Chọn SQL migration có checksum/khóa và transaction thay vì cài đồng thời Prisma/TypeORM. Đây là lựa chọn hiện thực cho D06, có thể đánh giá ORM sau bằng ADR mới.
- Transaction SERIALIZABLE với retry hữu hạn; giữ tồn/slot/voucher/đơn/outbox trong một transaction. Idempotency gắn principal/operation/key và payload hash.
- Phiên opaque Bearer token lưu hash, có hạn và rotation/logout. Chưa hiện thực cookie/CSRF, refresh token dài hạn, OAuth2/OIDC/JWT. Cập nhật client theo hợp đồng hiện tại trước dùng API.
- OTP local chỉ dùng non-production. Payment adapter chỉ có local sandbox HMAC và refund mô phỏng; mặc định tắt online. Production từ chối các chế độ local này.
- Worker dựa DB thực hiện expiry và IN_APP outbox consumer; chưa cần Redis/BullMQ/broker để chạy bản local. Không coi đây là broker liên dịch vụ hoặc hệ thống gửi provider hoàn chỉnh.
- AI Gateway có adapter `/chat`, timeout, validation và kiểm chứng SKU/nguồn; proposal lưu trong migration 002, có xác nhận và kiểm tra lại giá/tồn/version trước apply. Chưa có model/RAG thực; thiếu cấu hình service trả AI_UNAVAILABLE. Recommendation chỉ là baseline hàng còn tồn, không cá nhân hóa.
- Token QR lưu hash cùng nonce, giá trị trình cho khách được dẫn xuất HMAC bằng AUTH_SECRET; raw token không được lưu trong bảng pickup_tokens. Đổi secret làm token QR hiện hành không còn khớp và cần rotate theo quy trình.

## Hệ quả

Kiểm chứng trực tiếp được quy tắc tiền/tồn trên PostgreSQL; đổi lại phải tự duy trì SQL và mapping dữ liệu. Chưa có SQL query codegen/type-safe ORM. Migration chỉ do một pipeline chạy; tài khoản ứng dụng production cần quyền tối thiểu riêng.

Schema MVP chưa có delivery/loyalty/review/lots; cấm hủy tự động đơn đã thu tiền mặt để tránh bỏ mất nghĩa vụ hoàn. Cần workflow hoàn tiền mặt, provider live, giám sát, quyền dữ liệu và gate vận hành trước production. Những phần spec chưa hiện thực tiếp tục nằm trong backlog.

## Bằng chứng và tài liệu

[Migration](../../backend/src/database/migrations/001_initial.sql), [test tích hợp](../../backend/test/backend.integration.spec.ts), [hướng dẫn backend](../../backend/README.md). Bộ test dùng schema PostgreSQL ngẫu nhiên, không truncate schema dữ liệu ứng dụng.
