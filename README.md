# ShopGo

Nền tảng bán lẻ đa kênh có AI hỗ trợ. Hiện có backend MVP Click & Collect với NestJS/PostgreSQL và frontend Next.js để thử dữ liệu theo các vai trò khách, picker, quầy nhận, quản lý và admin. Model/AI service thực vẫn là tích hợp riêng.

- [Hướng dẫn chạy backend, tài khoản demo, API và giới hạn](backend/README.md)
- [Hướng dẫn chạy frontend và thử một vòng đơn đầy đủ](frontend/README.md)
- [Tài liệu yêu cầu, kiến trúc, dữ liệu và kiểm thử](docs/README.md)
- [Schema SQL ban đầu](backend/src/database/migrations/001_initial.sql)

Từ thư mục gốc, khởi động PostgreSQL bằng `docker compose up -d postgres`, cấu hình `backend/.env` theo mẫu rồi dùng `scripts/backend.ps1` để cài dependency, migrate, seed, chạy API và worker. Chi tiết từng bước ở Backend README. Các chế độ OTP/payment local không dùng cho production.
