# Tài liệu dự án ShopGo

ShopGo là nền tảng bán lẻ đa kênh có AI hỗ trợ, kết nối đặt hàng trực tuyến, nhận tại cửa hàng và giao tận nơi với vận hành tồn kho, soạn hàng và chăm sóc khách hàng.

## Trạng thái và cách đọc

- Phiên bản tài liệu: 0.2, ngày 12/11/2026; bổ sung kiến trúc đích, công nghệ, multi-agent và luồng Click & Collect.
- Đây là đặc tả thiết kế đề xuất dựa trên tổng quan dự án; chưa xác nhận tính năng đã được lập trình, tích hợp hay triển khai.
- Backend MVP đã bắt đầu hiện thực trong `backend`; phạm vi chạy được, lệnh local và giới hạn tích hợp nằm tại [Backend README](../backend/README.md). Các mục trong đặc tả ngoài phạm vi đó vẫn là thiết kế.
- Frontend Next.js đã kết nối API cho mua sắm và vận hành local; màn hình, hướng dẫn tài khoản mẫu và phạm vi kiểm thử ở [Frontend README](../frontend/README.md).
- Phạm vi MVP ưu tiên Click & Collect. Giao tận nơi và các mô hình AI chuyên sâu nằm trong lộ trình mở rộng.
- Chỉ tiêu thời gian, tải và chất lượng trong tài liệu là mục tiêu nghiệm thu ban đầu, cần hiệu chỉnh bằng dữ liệu thử nghiệm.
- Tiền lưu bằng số nguyên VND; thời gian trao đổi qua API dùng ISO 8601 có múi giờ, lưu UTC; giao diện hiển thị Asia/Ho_Chi_Minh.

## Mục lục

| Nhóm | Nội dung |
| --- | --- |
| Yêu cầu | [Tầm nhìn và phạm vi](01-yeu-cau/tong-quan-va-pham-vi.md), [Chức năng và phân quyền](01-yeu-cau/chuc-nang-va-phan-quyen.md), [User story và tiêu chí nghiệm thu](01-yeu-cau/user-stories.md), [Yêu cầu phi chức năng](01-yeu-cau/phi-chuc-nang.md) |
| Kiến trúc | [Kiến trúc hệ thống](02-kien-truc/kien-truc-he-thong.md), [Microservices và sự kiện](02-kien-truc/microservices-va-su-kien.md), [Lựa chọn công nghệ](02-kien-truc/cong-nghe-de-xuat.md), [Luồng nghiệp vụ](02-kien-truc/luong-nghiep-vu.md), [Click & Collect đầu cuối](02-kien-truc/click-and-collect.md) |
| Dữ liệu | [Mô hình và ERD](03-co-so-du-lieu/mo-hinh-du-lieu.md), [Từ điển và ràng buộc](03-co-so-du-lieu/tu-dien-du-lieu.md) |
| API | [Quy ước API](04-api/quy-uoc-api.md), [Danh mục endpoint](04-api/danh-muc-endpoint.md) |
| Giao diện | [Màn hình và trải nghiệm](05-thiet-ke-ui/man-hinh-va-trai-nghiem.md), [Đăng ký, đăng nhập và bản đồ](05-thiet-ke-ui/dang-ky-dang-nhap-ban-do.md) |
| AI | [Danh mục tính năng](06-ai/danh-muc-tinh-nang.md), [Kiến trúc multi-agent](06-ai/kien-truc-multi-agent.md), [Agent, công cụ và an toàn](06-ai/agent-va-cong-cu.md), [Dữ liệu và đánh giá](06-ai/du-lieu-va-danh-gia.md) |
| Kế hoạch | [Lộ trình và backlog](07-ke-hoach/lo-trinh-va-backlog.md), [Rủi ro và quyết định cần chốt](07-ke-hoach/rui-ro-va-quyet-dinh.md) |
| Kiểm thử | [Kế hoạch kiểm thử](08-kiem-thu/test-plan.md), [Test case](08-kiem-thu/test-cases.md) |
| Vận hành | [Triển khai](09-van-hanh/trien-khai.md), [Runbook](09-van-hanh/runbook.md) |
| Quyết định kiến trúc | [Danh mục ADR](adr/README.md), [ADR-001](adr/0001-kien-truc-va-nguon-du-lieu.md), [ADR-002](adr/0002-pham-vi-mvp-va-ai.md), [ADR-003](adr/0003-tach-dich-vu-va-hop-dong-su-kien.md), [ADR-004](adr/0004-backend-mvp-postgresql.md) |

## Thuật ngữ thống nhất

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Store | Một chi nhánh/cửa hàng có tồn kho, nhân sự và khung giờ riêng |
| SKU | Mã một biến thể hàng hóa có thể bán và quản lý tồn kho |
| On hand / reserved / available | Tồn vật lý / lượng đã giữ / lượng có thể bán |
| Reservation | Bản ghi giữ tồn cho đơn, có hạn dùng và trạng thái |
| Slot | Khung giờ nhận/giao có sức chứa giới hạn |
| Picker | Nhân viên được phân công soạn đơn của cửa hàng |
| Counter | Nhân viên có quyền xác nhận bàn giao tại quầy |
| Idempotency | Gửi lại cùng thao tác không tạo thêm kết quả nghiệp vụ |
| Outbox | Sự kiện được ghi cùng giao dịch nghiệp vụ để xử lý nền tin cậy |

Khi thay đổi yêu cầu, cập nhật đồng thời phạm vi, state machine, dữ liệu, API và test case liên quan. Tài liệu vận hành mô tả quy trình dự kiến; chỉ dùng chạy thật sau khi đã có cấu hình và diễn tập tương ứng.
