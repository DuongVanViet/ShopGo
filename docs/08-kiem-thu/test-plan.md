# Kế hoạch kiểm thử

## Mục tiêu và phạm vi

Xác minh luồng Click & Collect từ chọn store đến bàn giao; ưu tiên không bán vượt tồn, không thu/hoàn/bàn giao trùng, không truy cập chéo dữ liệu và không để AI tự thực hiện thao tác nhạy cảm. Delivery và AI nâng cao chỉ kiểm thử nghiệm thu khi vào phạm vi phát hành.

## Các lớp kiểm thử

| Lớp | Phạm vi | Công cụ/hình thức đề xuất |
| --- | --- | --- |
| Unit | Tính tiền/voucher, transition, scope policy, expiry, schema tools | Backend test runner được chọn; frontend Vitest; Python pytest |
| Integration | Transaction PostgreSQL, giữ tồn/slot, inbox/outbox, retry, refunds | DB/Redis test tách biệt; không thay khóa DB bằng mock |
| Contract | DTO/OpenAPI, lỗi/version/idempotency, webhook adapter | Schema validation và fixture theo cổng đã chọn |
| E2E | Khách/picker/counter/manager, lỗi mạng và tải lại | Playwright đề xuất; dữ liệu seed xác định |
| Load/concurrency | SKU cuối, slot cuối, voucher cuối, callback vs expiry | k6 hoặc harness đồng thời; kiểm tra DB invariant sau chạy |
| Quyền và dữ liệu | Ownership, scope store, token/session/CSRF, rate limit | Test tự động và kiểm tra thủ công có kiểm soát |
| AI eval | Giá/tồn, nguồn FAQ, injection, ngân sách, timeout | Tập eval phiên bản hóa; chấm máy và người duyệt |
| UAT/vận hành | Soạn thật trên dữ liệu giả, quét camera, no-show, restore | Nhân sự cửa hàng và người trực xác nhận |

Các công cụ chỉ là đề xuất, chưa được cài hoặc chạy bởi bộ tài liệu này.

## Môi trường và dữ liệu

Test dùng DB riêng, provider sandbox/mock đã ghi rõ, clock có kiểm soát cho expiry, tài khoản ở hai store và nhiều vai trò. Seed có SKU tồn 0/1/10; slot 0/1/nhiều; voucher còn 1 lượt; đơn online/chưa trả/đã trả/READY; payload webhook hợp lệ, sai chữ ký, sai tiền, trùng và đến muộn.

Không dùng tiền thật, SĐT khách thật hoặc log production nguyên bản. Tác vụ test phá hủy dữ liệu chỉ chạy trên môi trường được định danh là test; không dựa riêng vào tên database để đảm bảo cách ly.

## Tiêu chí bắt đầu và kết thúc

Entry: story/API/schema đã thống nhất; có build chạy được, seed và fixture; phụ thuộc cổng đã xác định. Exit: P0 pass, không còn lỗi blocker/critical, regression rủi ro tiền/tồn/quyền pass, tải đáp ứng mục tiêu đã thống nhất, restore drill đạt RPO/RTO đề xuất hoặc có quyết định điều chỉnh, UAT có người duyệt.

Lỗi critical gồm mất/thu trùng tiền, vượt tồn, bàn giao sai, lộ dữ liệu chéo và không thể khôi phục luồng chính. Không thay kết quả test bằng ảnh demo một luồng thành công.

## Truy vết

| Yêu cầu/story | Test case chính |
| --- | --- |
| FR-01, US-17 | TC-01, TC-02, TC-21 |
| FR-03..05, US-02..05 | TC-03..08, TC-23 |
| FR-06, US-06/18 | TC-09..12, TC-22 |
| FR-07..10, US-08..12 | TC-13..18, TC-24 |
| FR-12..13, US-13 | TC-19, TC-20 |
| FR-17, US-14..15 | TC-25..29 |
| NFR-01..05 | TC-06..08, TC-12, TC-30..32 |
| FR-14, US-16 | TC-33 — chỉ bắt buộc khi phát hành delivery |

## Báo cáo

Mỗi lần chạy ghi build/commit, migration, seed, môi trường, provider mode, số ca pass/fail/blocked, lỗi còn mở và evidence. Với test concurrency ghi số request thành công, thất bại theo loại, số dư tồn/slot/quota cuối cùng. Báo cáo AI ghi model/prompt/index/dataset version, tránh chỉ nêu điểm trung bình mà bỏ ca vi phạm quyền hoặc ngân sách.

## Gate kiến trúc mở rộng

Khi triển khai broker, saga, search/vector/warehouse hoặc multi-agent đầy đủ, bổ sung TC-M01..M12 ở [test case](test-cases.md) theo phạm vi phát hành. Dùng failure injection cho crash, mạng chập chờn, trễ/đảo sự kiện và restart coordinator; kiểm tra dữ liệu từng service cùng kết quả đối soát, không chỉ response gateway. Replay hoặc restore phải diễn ra trong môi trường cách ly không có credential thu/gửi thật.

Trước mỗi cutover: contract tests giữa producer/consumer qua, schema tương thích, backfill có checksum/đối soát, fallback/rollback đã diễn tập và có người sở hữu DLQ/saga kẹt. Với agent mới, kiểm tra approval, budget dùng chung và quyền thay đổi giữa đề xuất với apply.
