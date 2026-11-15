# Rủi ro và quyết định cần chốt

## Sổ rủi ro

| ID | Rủi ro / tín hiệu | Tác động | Biện pháp và chủ trách nhiệm đề xuất |
| --- | --- | --- | --- |
| R01 | Tồn online lệch kệ thực tế; picker báo thiếu tăng | Hủy đơn, mất niềm tin | Kiểm kê, ledger và reservation; manager xác nhận sai lệch |
| R02 | Callback lặp/trễ, thu tiền nhưng hết hạn | Mất tiền/hoàn trùng | Inbox dedup, khóa đơn, đối soát và refund; backend/payment owner |
| R03 | Quét QR lặp hoặc lộ token | Giao sai/trùng | Token hash, expiry, một lần, scope counter, audit; fulfillment owner |
| R04 | Lộ dữ liệu chéo user/store qua API hoặc AI | Mất riêng tư | Ownership/store guards và adversarial tests; backend/AI owner |
| R05 | AI bịa giá, dị ứng, chính sách | Tư vấn sai, khiếu nại | Tools có kiểm chứng, không khẳng định thiếu nguồn, escalation; AI owner |
| R06 | Quá năng lực slot, khách không đến | Trễ/hỏng hàng | Capacity có khóa, cutoff, nhắc nhận, no-show thủ công; store manager |
| R07 | Dữ liệu ít/lệch, forecast không hơn baseline | Lãng phí/nhập sai | Chờ đủ dữ liệu, backtest, không tự đặt nhập; data owner |
| R08 | OTP/payment/AI gián đoạn hoặc chi phí tăng | Không đăng nhập/đặt được | Timeout, circuit breaker, quota và fallback phù hợp từng dịch vụ; vận hành |
| R09 | Phạm vi quá lớn cho đội ban đầu | Chậm pilot | MVP Click & Collect, P0 rõ, đổi scope qua backlog; product owner |
| R10 | Backup có nhưng không khôi phục được | Mất dữ liệu | Restore drill, kiểm tra checksum và đối soát; vận hành |
| R11 | COD giao hàng thiếu đối soát | Thất thoát tiền | Hoãn delivery đến khi có sổ thu, ca, người chịu trách nhiệm; finance/ops |
| R12 | Chính sách dữ liệu chưa rõ | Thu/lưu quá mức hoặc khó xử lý yêu cầu | Duyệt retention, quyền sử dụng và quy trình xóa; chủ dự án |

## Quyết định mở

| ID | Cần quyết định | Đề xuất hiện tại | Mốc phải chốt |
| --- | --- | --- | --- |
| D01 | Cửa hàng pilot, quy mô catalog/tải | Một store trước, thiết kế scope nhiều store | Discovery |
| D02 | OTP provider, auth nhân sự, cookie/CSRF/token TTL | Khách OTP; nhân sự quản lý tập trung; cookie HttpOnly | Trước E01 |
| D03 | Cổng thanh toán đầu tiên và hoàn tiền | Một cổng có sandbox/webhook/refund; trả tại quầy hỗ trợ song song | Trước E04 |
| D04 | TTL giữ tồn, cutoff slot, khách trễ/no-show | Online đề xuất 10 phút; no-show quản lý duyệt | Trước E03/E05 |
| D05 | Điều kiện hủy/đổi trả, hạn mức refund, dị ứng | Không tự thay hàng; hủy trước PICKING; ngoại lệ có duyệt | Trước nghiệm thu nghiệp vụ |
| D06 | Truy cập DB và quyền sở hữu migration | Backend local dùng pg + SQL migration theo ADR-004; chưa chọn ORM | Đã hiện thực local; rà lại khi đổi kiến trúc |
| D07 | Hosting, secret store, email/SMS/push, giám sát | Dev Compose; môi trường tách biệt | Trước staging |
| D08 | Model/provider AI, ngân sách, lưu chat, consent | Chọn theo eval; tool tối thiểu và PII tối thiểu | Trước E07 |
| D09 | Định nghĩa doanh thu và ngày ghi nhận | Đơn hoàn tất theo ngày nhận; tiền thu/hoàn riêng | Trước report/UAT |
| D10 | Delivery tự vận hành hay đối tác, COD, bằng chứng và vị trí | Sau MVP; ADR và workflow riêng | Trước E09 |
| D11 | Hàng cân ký, hạn dùng/lô, hàng có điều kiện | Loại khỏi MVP; SKU nguyên đơn vị | Trước nhập catalog pilot |
| D12 | Retention, RPO/RTO, đối soát sau restore, quyền dữ liệu | Mục tiêu pilot trong NFR, cần duyệt vận hành | Trước pilot |

Các đề xuất là giả định để tài liệu có thể triển khai tiếp, không phải lựa chọn đã được chủ dự án phê duyệt. Khi chốt, ghi người quyết định, ngày, lý do và liên kết ADR nếu ảnh hưởng kiến trúc. Các câu hỏi pháp lý/chính sách thực tế cần thẩm định riêng; tài liệu này không xác nhận tuân thủ một chế độ pháp lý cụ thể.

## Quyết định bổ sung cho kiến trúc đích

| ID | Cần chốt | Mốc và bằng chứng |
| --- | --- | --- |
| D13 | Kafka hay RabbitMQ, topology, retention, routing/partition key | Trước tách consumer; có PoC replay/crash/DLQ và người vận hành |
| D14 | API Gateway, OAuth2/OIDC provider, JWT/session và service identity | Trước nhiều client/service; kiểm chứng issuer/audience, scope và thu hồi |
| D15 | Search/vector/warehouse, dữ liệu đi vào và retention | Trước tạo bản chiếu; có eval, rebuild và policy PII |
| D16 | Saga coordinator, deadline, compensation và API operation status | Trước tách DB nhóm checkout/handover; có failure tests |
| D17 | Flutter/React Native, maps và cloud mục tiêu | Trước client mới/deploy tương ứng; có thử nghiệm khu pilot và chi phí |
| D18 | Tự động phân công đến mức nào, quyền duyệt giá/hoàn/risk | Trước bật agent vận hành; có approval matrix, hạn mức và kill switch |

Rủi ro mới cần theo dõi: schema event không tương thích, consumer lag làm dữ liệu cũ, replay gây tác dụng lặp, saga kẹt và approval cũ sau thay dữ liệu. Chủ dịch vụ phải có cảnh báo, recovery và test tương ứng trước cutover; chi tiết ở [kiểm thử mở rộng](../08-kiem-thu/test-cases.md).
