# Sổ quyết định kiến trúc

ADR ghi lý do, hệ quả và trạng thái của lựa chọn ảnh hưởng dài hạn. ADR-0001..0003 là **Đề xuất**; ADR-0004 ghi các lựa chọn đã hiện thực trong backend local theo yêu cầu xây dựng. Quyết định triển khai production vẫn cần chốt theo backlog. Không sửa lịch sử để che lựa chọn cũ, dùng ADR mới thay thế nếu thay đổi.

| ADR | Chủ đề | Trạng thái |
| --- | --- | --- |
| [0001](0001-kien-truc-va-nguon-du-lieu.md) | Modular monolith, nguồn dữ liệu và migration | Đề xuất |
| [0002](0002-pham-vi-mvp-va-ai.md) | Click & Collect trước, AI qua tools có xác nhận | Đề xuất |
| [0003](0003-tach-dich-vu-va-hop-dong-su-kien.md) | Kiến trúc đích event-driven và lộ trình tách dịch vụ | Đề xuất |
| [0004](0004-backend-mvp-postgresql.md) | Hiện thực backend PostgreSQL, SQL migration, session và sandbox | Đã hiện thực local |

## Mẫu ADR mới

```markdown
# ADR-NNNN: Tên quyết định
Trạng thái: Đề xuất / Chấp nhận / Thay thế / Từ chối
Ngày: YYYY-MM-DD
Người duyệt: Chưa xác định
## Bối cảnh
Vấn đề và ràng buộc có chứng cứ.
## Quyết định
Lựa chọn cụ thể và phạm vi áp dụng.
## Phương án cân nhắc
Các lựa chọn khác cùng lý do.
## Hệ quả
Lợi ích, chi phí, giới hạn và kế hoạch kiểm chứng.
## Liên kết
Yêu cầu, test, ADR liên quan/thay thế.
```
