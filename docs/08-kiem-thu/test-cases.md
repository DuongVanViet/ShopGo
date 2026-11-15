# Test case nghiệp vụ trọng yếu

Các ca là đặc tả kiểm thử cần triển khai, chưa phải kết quả đã chạy. Mỗi ca dùng fixture độc lập, actor có quyền được chỉ định và snapshot DB trước/sau.

| ID | Điều kiện / bước thực hiện | Kết quả mong đợi | Mức |
| --- | --- | --- | --- |
| TC-01 | Xin OTP liên tiếp, nhập sai quá giới hạn, dùng lại mã đã dùng | Rate limit/hết hiệu lực đúng; không log OTP; không tạo nhiều phiên từ một challenge | P0 |
| TC-02 | Khách A GET đơn B; picker store A thao tác đơn store B; thử qua AI tool | Không lộ dữ liệu; không có thay đổi DB; audit sự kiện bất thường | P0 |
| TC-03 | Tìm tên có/không dấu; SKU inactive hoặc store không bán | Kết quả theo store và bộ lọc; không bán SKU inactive | P1 |
| TC-04 | Đổi store khi giỏ có SKU thiếu/chênh giá; chưa rồi mới xác nhận | Preview đúng; không đổi giỏ trước xác nhận; version tăng sau xác nhận | P1 |
| TC-05 | Sửa total/discount ở client; dùng quote hết hạn hoặc cartVersion cũ | Không tin tiền client; quote hết hạn/version cũ bị từ chối, không reserve | P0 |
| TC-06 | Tồn SKU = 1, slot đủ; hai checkout khác nhau đồng thời | Một thành công; reserved = 1; không tồn âm, không order mồ côi | P0 |
| TC-07 | Slot còn 1 suất, tồn đủ; hai checkout đồng thời | Một booking thành công; allocated không vượt capacity | P0 |
| TC-08 | Voucher còn 1 lượt; hai checkout đồng thời, sau đó hủy đơn thắng | Không vượt quota; release theo policy một lần | P0 |
| TC-09 | Retry tạo đơn/payment với cùng key và body; đổi body giữ key | Cùng body cùng kết quả; khác body trả conflict; không attempt trùng | P0 |
| TC-10 | Gửi webhook giả chữ ký/sai merchant/sai amount/sai currency | Không PAID/CONFIRMED; lưu bằng chứng đã che dữ liệu và cảnh báo | P0 |
| TC-11 | Webhook hợp lệ lặp 10 lần, đến không đúng thứ tự | Chỉ một ghi nhận thu; không lùi PAID sang PENDING/FAILED từ event cũ | P0 |
| TC-12 | Callback PAID và job expiry chạy đồng thời trước/qua expiresAt; callback sau CANCELLED | Kết quả tuần tự hợp lệ theo thời gian DB; quá hạn không sống lại, tiền thu có nghĩa vụ hoàn | P0 |
| TC-13 | Hai picker claim một order/version đồng thời | Một assignment ACTIVE; một lỗi conflict; timeline một lần | P0 |
| TC-14 | Quét SKU sai hoặc pickedQuantity thiếu rồi chuyển READY | Báo lỗi; đơn vẫn PICKING; có thể báo sự cố thiếu | P0 |
| TC-15 | READY, quét token đúng store; xác nhận bàn giao rồi lặp request/key khác | Một COMPLETED, một stock consumption; lần sau đã nhận, không trừ tồn lại | P0 |
| TC-16 | Token hết hạn/thu hồi/sai store hoặc token của order khác | Không lookup/bàn giao trái quyền; rotate làm token cũ vô hiệu | P0 |
| TC-17 | PAY_AT_PICKUP chưa thu tiền; thử handover; ghi collection rồi mất mạng và retry | Chặn handover trước thu; collection một lần; sau tải lại bàn giao được, không thu lại | P0 |
| TC-18 | Hủy online đã trả trước soạn; retry release và refund; refund callback FAILED rồi đối soát | Trả tồn/slot một lần; hiển thị REFUND_PENDING đến khi thật sự thành công; tổng hoàn không vượt thu | P0 |
| TC-19 | Đơn completed/cancelled/paid/refunded ở hai ngày; chạy report | Định nghĩa ngày và tiền đúng; không cộng đơn hủy vào doanh thu hoàn tất | P1 |
| TC-20 | Commit đơn rồi worker thông báo lỗi; restart worker và replay outbox | Đơn không rollback do gửi lỗi; thông báo/dedup đúng; retry hữu hạn, có hàng đợi lỗi | P1 |
| TC-21 | Logout/khóa account, refresh token cũ; gọi API với CSRF sai nếu dùng cookie | Phiên không refresh trái phép; thao tác ghi không được chấp nhận | P0 |
| TC-22 | Hai payment attempts của cùng đơn đều được provider thu | Một nghĩa vụ trả tiền cho đơn; phát hiện tiền dư, tạo quy trình hoàn/đối soát | P0 |
| TC-23 | Checkout lỗi giữa ghi dòng/reserve/slot/outbox hoặc timeout sau commit | Trước commit rollback hết; sau commit retry lấy cùng order, không giữ chỗ rời rạc | P0 |
| TC-24 | Manager giảm on_hand xuống dưới reserved; hủy đơn đã soạn chưa xác nhận restock | Bị chặn; mở sự cố và yêu cầu quy trình xử lý; không mở bán tồn không có | P0 |
| TC-25 | AI lập giỏ 300k, có món hết hàng hoặc tăng giá giữa proposal/apply | SKU/tổng từ server; apply yêu cầu xem lại, không vượt ngân sách âm thầm | P0 |
| TC-26 | Người dùng/tài liệu chèn lệnh đọc đơn khác, in secret hoặc gọi tool quản trị | Không thực thi; không lộ dữ liệu; log lý do từ chối an toàn | P0 |
| TC-27 | AI tự sinh “đã được khách xác nhận”, gọi apply không có token | Backend từ chối; giỏ không đổi | P0 |
| TC-28 | FAQ nguồn RETIRED hoặc không có chính sách cho câu hỏi | Dùng nguồn hiệu lực hoặc escalation; không bịa cam kết | P1 |
| TC-29 | AI timeout, model output sai schema, tool lỗi liên tiếp | Kết thúc trong budget; fallback; checkout và đơn vẫn dùng được | P1 |
| TC-30 | Chạy tải theo NFR với dataset/tải quy định; đo sau warm-up | p95 đạt mục tiêu, lỗi hệ thống được ghi riêng với hết tồn/slot | P1 |
| TC-31 | Redis/worker gián đoạn rồi phục hồi khi nhiều reservation hết hạn | DB scan xử lý đủ; COMMITTED không bị giải phóng; không release lặp | P0 |
| TC-32 | Restore backup vào môi trường cách ly, replay/đối soát provider sau điểm backup | Đo RPO/RTO; không gửi thông báo/thu tiền thật từ môi trường drill; có danh sách sai lệch cần xử lý | P0 |
| TC-33 | Sau MVP: shipper khác nhận job, gửi hoàn tất thiếu proof/COD, retry sau mất mạng | Chỉ actor được phân công; bằng chứng/tiền đúng policy; không hoàn tất/đối soát trùng | P0 khi delivery |

## Kiểm tra UX thủ công

Thử màn hình 360px, bàn phím, nhãn đọc màn hình; từ chối camera/định vị; mất mạng sau đặt/thu tiền; mở hai tab sửa giỏ; bấm nút nhiều lần; nhận QR trên thiết bị khác. Đặc biệt xác minh thông báo “đã đặt”, “đã thu” và “đã nhận” chỉ hiện khi backend đã xác nhận trạng thái tương ứng.

## Kiểm thử bổ sung khi triển khai kiến trúc đích và multi-agent

Các ca dưới đây là gate cho thành phần mới tương ứng; không tuyên bố đã có microservices, broker hoặc tám agent chạy trong MVP.

| ID | Kịch bản | Kết quả mong đợi |
| --- | --- | --- |
| TC-M01 | Producer crash sau commit trước publish; consumer crash sau ghi DB trước ACK | Outbox phát lại; inbox/dedup ngăn tác dụng lặp, không mất nghiệp vụ đã commit |
| TC-M02 | Event trùng, version cũ/thiếu, schema không tương thích | Bỏ trùng/cũ theo hợp đồng, xử lý gap có kiểm soát, schema sai vào vùng lỗi; không ghi trạng thái tùy tiện |
| TC-M03 | Replay OrderCompleted/PaymentSucceeded vào consumer thông báo/analytics | Fact không nhân đôi; không tự gửi lại thông báo cũ hoặc gọi thu/hoàn tiền |
| TC-M04 | Saga giữ tồn thành công nhưng slot hoặc voucher thất bại; coordinator restart giữa bù trừ | Giải phóng đầy đủ một lần, recovery từ trạng thái bền vững, không xác nhận đơn thiếu tài nguyên |
| TC-M05 | Gateway token sai issuer/audience/hết hạn; client giả header actor; service gọi thiếu scope | Từ chối tại biên thích hợp; backend vẫn chặn ownership/store trái phép |
| TC-M06 | Search/vector/warehouse mất kết nối hoặc trễ; rebuild index trong khi còn giao dịch | Không xác nhận tồn/tiền từ bản chiếu; giao dịch cốt lõi hoạt động theo fallback; rebuild không lộ quyền |
| TC-M07 | Handoff lặp giữa agents, nhiều agent cùng gọi tools, provider chậm | Budget tổng/depth/deadline được giữ; dừng và fallback, không nhân budget theo agent |
| TC-M08 | Refund/price/picker proposal được duyệt rồi thay payload, version, store hoặc hết hạn | Approval cũ bị từ chối, yêu cầu duyệt lại; model không tự bypass; audit có actor/hash/version |
| TC-M09 | Agent trả SKU/risk/ETA mâu thuẫn với API; thiếu chứng cứ nguồn | Lấy dữ liệu chuẩn, nêu không chắc/chuyển xử lý, không tự đổi đơn/giá/tiền |
| TC-M10 | Pipeline nhận sự kiện trùng/trễ chứa payload nhạy cảm hoặc schema lỗi | Dedup, event-time hợp lệ, lọc/quarantine PII/schema; fact/feature không rò dữ liệu hoặc dùng tương lai |
| TC-M11 | Job phân picker bị phát lại hoặc gợi ý picker hết ca/khác store | Một assignment hợp lệ theo version, kiểm tra lại ca/scope, manager có fallback |
| TC-M12 | Bật tủ nhận hàng: lệnh mở lặp, cửa mở nhưng callback mất, token phát lại | Không mở/giao trùng, có recovery/bằng chứng nhận; không COMPLETED chỉ do quét QR |

TC-M01..06 và TC-M10 thuộc gate tách dịch vụ/pipeline; TC-M07..09/11 thuộc gate multi-agent; TC-M12 chỉ bắt buộc khi làm tủ nhận hàng. Tất cả ca có tiền/quyền/tồn là P0 cho phần phát hành tương ứng.
