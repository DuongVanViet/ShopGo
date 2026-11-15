# Runbook vận hành và xử lý sự cố

## Phạm vi và đầu mối

Quy trình dự kiến cho pilot Click & Collect. Trước chạy thật phải điền người trực kỹ thuật, quản lý cửa hàng, đầu mối thanh toán và hỗ trợ khách; diễn tập trên staging. Không sửa trực tiếp status/tồn/tiền trong DB để bỏ qua kiểm soát nghiệp vụ.

## Dashboard và cảnh báo đề xuất

| Tín hiệu | Ngưỡng khởi đầu đề xuất | Hành động |
| --- | --- | --- |
| API 5xx | > 2% trong 5 phút khi có ít nhất 100 request | Người trực kiểm tra deployment và phụ thuộc |
| Payment mismatch / bàn giao trùng / tồn âm | Bất kỳ sự kiện xác nhận nào | Sự cố nghiêm trọng, giới hạn chức năng bị ảnh hưởng |
| Outbox oldest age | > 60 giây trong 5 phút | Kiểm tra dispatcher, Redis, worker |
| Reservation hết hạn chưa release | > 2 phút sau expiresAt | Kiểm tra job quét DB, đồng hồ và khóa |
| READY quá slot | Quá 15 phút, điều chỉnh theo store | Manager liên hệ khách, không tự hủy/hoàn |
| Refund pending | Quá thời gian xử lý đã thống nhất với provider | Đối soát và thông tin khách |
| AI latency/error/cost | Vượt budget hoặc error > 10%/5 phút có đủ mẫu | Tắt năng lực AI/fallback, không dừng checkout |

Ngưỡng cần hiệu chỉnh sau pilot để tránh nhiễu. Với ít lưu lượng, bổ sung synthetic check và cảnh báo lỗi đơn lẻ liên quan tiền/quyền.

## Quy trình chung

1. Ghi thời điểm UTC và giờ Việt Nam, requestId/orderId/payment reference, phạm vi store và triệu chứng; che dữ liệu cá nhân.
2. Phân mức: nghiêm trọng nếu ảnh hưởng tiền, quyền, toàn bộ checkout hoặc sai tồn diện rộng; thông báo đầu mối đã được chỉ định qua quy trình nội bộ.
3. Hạn chế tác động: tạm ngừng nhận đơn ở store hoặc payment method lỗi; vẫn cho xem đơn và bàn giao đơn đủ điều kiện nếu an toàn.
4. Đọc log/metrics/trace và trạng thái qua công cụ có audit; xác định giao dịch đã commit trước khi retry.
5. Khôi phục bằng thao tác idempotent được hỗ trợ, đối soát dữ liệu trước mở lại; ghi nguyên nhân và hành động phòng lặp.

## Thu tiền thành công nhưng đơn chưa xác nhận

Tra provider reference và merchant bằng công cụ cổng được cấp quyền; so amount/currency/order. Nếu inbox đã có, kiểm tra handler; nếu chưa có, dùng tác vụ reconciliation được xác thực. Đơn còn hạn có thể chuyển theo luồng payment hợp lệ; đơn hết hạn/hủy phải hoàn/đối soát, không giữ lại hàng đã được bán cho khách khác. Không yêu cầu khách trả lần hai khi chưa xác minh lần đầu.

## Lỗi giữ tồn hoặc thiếu hàng tại quầy

Tạm dừng bán SKU bị ảnh hưởng ở store, kiểm kê on_hand, reserved và hàng đang soạn; đối chiếu ledger/order. Không giảm on_hand thấp hơn reserved. Xử lý đơn bị ảnh hưởng qua luồng manager hủy/hoàn đã duyệt và xác nhận hàng trả lại trước release; sau đó điều chỉnh tồn có lý do. Theo dõi các đơn khác giữ cùng SKU.

## QR không dùng được hoặc khách báo đã nhận nhầm

Kiểm tra token hết hạn/thu hồi/used và store scope bằng mã đơn, không gửi raw token qua log/chat hỗ trợ. Token hết hạn có thể rotate sau xác minh khách. Nếu đã COMPLETED, khóa bàn giao tiếp, xem audit counter/thời điểm và chứng cứ thu tiền; chuyển quản lý xử lý. Không cấp QR mới để giao lần hai cho đơn đã hoàn tất.

## Redis/queue hoặc notification gián đoạn

Kiểm tra DB còn ghi giao dịch an toàn không; nếu có, outbox giữ sự kiện. Khôi phục Redis/worker, replay theo eventId; job quét DB thu hồi reservation ACTIVE hết hạn. Không release COMMITTED. Notification lỗi không đổi trạng thái đơn. Chặn backlog gửi thông báo cũ gây nhầm bằng kiểm tra phiên bản/trạng thái trước gửi.

## AI lỗi hoặc hành vi không đúng

Tắt feature flag năng lực lỗi, giữ tìm kiếm/giỏ thông thường. Thu thập prompt/model/index version và tool trace đã che dữ liệu. Nếu có nghi ngờ vượt quyền, thu hồi danh tính/tool ghi bị ảnh hưởng và rà audit. Chỉ bật lại sau khi thêm ca regression, xác minh nguồn và duyệt người phụ trách.

## Backup, restore và đối soát

Pilot đề xuất backup DB ít nhất hàng ngày, lưu bản ngoài máy chạy ứng dụng và kiểm tra khôi phục định kỳ. Retention, mã hóa và phục hồi theo thời điểm cần chốt theo ngân sách để đạt RPO/RTO. Redis/cache không thay thế backup DB; cần lưu cấu hình, migration version và thông tin storage cần phục hồi.

Restore drill phải cách ly mạng, tắt gửi thật và webhook live. Ghi thời điểm backup, thời gian phục hồi và chênh dữ liệu. Khi restore production, dừng ghi có kiểm soát, phục hồi DB, xác minh invariant, đối soát provider và bàn giao đã xảy ra sau điểm backup, khôi phục outbox với dedup. Không tự phát lại lệnh thu/hoàn tiền từ snapshot cũ. Chỉ mở nhận đơn sau khi quản lý kỹ thuật/vận hành xác nhận không có xung đột chưa xử lý.

## Công việc định kỳ

Hằng ngày: đối soát tiền thu/hoàn và thu tại quầy, đơn trễ/no-show, refund pending, tồn sai và queue lỗi. Hằng tuần: rà quyền nhân sự, stockout, tỷ lệ hủy, chi phí/chất lượng AI. Định kỳ theo lịch đã duyệt: restore drill, rà secret/quyền truy cập, retention và diễn tập sự cố. Mỗi sự cố nghiêm trọng có postmortem gồm ảnh hưởng, nguyên nhân, dữ liệu được đối soát và người/mốc xử lý phòng ngừa.

## Broker, saga và pipeline — khi được triển khai

Khi consumer lag tăng, xác định topic/queue, consumer group, oldest event age và dependency lỗi trước khi tăng worker. Không xóa queue/DLQ hoặc reset offset để che backlog. Kiểm tra schema/quyền và dead-letter reason, sửa consumer rồi replay có giới hạn với eventId cũ; theo dõi không tạo tác dụng lặp. Lọc PII trước khi lưu payload vào công cụ xử lý sự cố.

Saga kẹt cần tra sagaId/correlationId, trạng thái giữ tồn/slot/quota và payment thực tế ở từng service. Retry command/bù trừ qua công cụ có audit, không sửa một DB để giả vờ toàn quy trình đã xong. Nếu đã thu nhưng không còn tài nguyên hợp lệ, xử lý hoàn theo luồng được duyệt. Handover dở dang phải xác minh hàng/tiền thực tế trước mọi lần giao hoặc thu tiếp.

Nếu warehouse/search/vector sai, tạm dừng tính năng đọc bản chiếu lỗi và rebuild từ nguồn chuẩn với dedup/version. Không sửa tồn/đơn theo số liệu index. Sau sự cố so sánh số event, fact, reservation, collection/refund và ghi sai lệch còn tồn tại trước khi kết thúc.
