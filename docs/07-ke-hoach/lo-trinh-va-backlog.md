# Lộ trình và backlog

## Cách lập kế hoạch

Lộ trình dưới đây theo sprint giả định 2 tuần, chưa gắn ngày cam kết vì chưa có đội ngũ và ngân sách. Ước lượng lại sau discovery; chỉ bắt đầu pilot sau khi đạt exit criteria. Không chạy song song tích hợp tiền thật trước khi có hợp đồng và kiểm tra sandbox.

| Giai đoạn | Phạm vi | Kết quả và điều kiện ra |
| --- | --- | --- |
| Discovery — 1 sprint | Policy hủy/no-show/hoàn, vai trò, cổng tiền/OTP, schema và hợp đồng API | Người phụ trách chốt các quyết định P0; prototype checkout/counter được duyệt |
| Nền tảng — 1 sprint | Workspace, lint/build, DB/migration, auth, scope store, seed, log | Chạy môi trường dev, test truy cập chéo bị chặn, migration lặp được trên DB mới |
| Bán hàng — 2 sprint | Catalog, search cơ bản, giỏ, quote, slot, voucher, checkout reserve | Qua test cạnh tranh tồn/slot/quota và retry; chưa cần AI |
| Tiền và nhận hàng — 2 sprint | Một cổng sandbox, thu tại quầy, picker, QR, hủy/hoàn, outbox | E2E cả hai phương thức trả tiền; callback trễ/lặp và bàn giao lặp an toàn |
| AI và quản trị — 1 sprint | Proposal, FAQ, tồn/giá, báo cáo, thông báo, observability | AI gate ban đầu đạt, fallback hoạt động, dashboard đối soát đúng |
| Hardening/pilot — 1 sprint trở lên | UAT, load, quyền, phục hồi, đào tạo một store | Không còn lỗi blocker, runbook diễn tập, có người vận hành và đường hỗ trợ |
| Sau pilot | Delivery, mua lại, điểm/review, nhiều cổng; AI mở rộng theo dữ liệu | Mỗi tính năng có đặc tả/test và tiêu chí kinh doanh trước bật |

Thứ tự có thể điều chỉnh theo năng lực đội, nhưng phụ thuộc tồn/đơn trước thanh toán và dữ liệu sạch trước ML phải giữ.

## Backlog ưu tiên

| Epic | Priority | Story/yêu cầu | Phụ thuộc |
| --- | --- | --- | --- |
| E01 Danh tính/phân quyền | P0 | US-17, FR-01 | Chọn auth nhân sự/OTP |
| E02 Catalog/store | P0 | US-01..02, FR-02..03 | Seed, giá theo store |
| E03 Giỏ/checkout/tồn | P0 | US-03..05, US-11, FR-05 | E01, E02, slot/voucher transaction |
| E04 Payment/refund | P0 | US-06, US-18 | E03, cổng sandbox, inbox/outbox |
| E05 Fulfillment/counter | P0 | US-07..10, US-12 | E03, E04, policy no-show |
| E06 Admin/report | P1 | US-13, FR-10..13 | Ledger tiền/tồn và scope |
| E07 Assistant/FAQ | P1 | US-14..15 | Catalog tools, tri thức duyệt, consent/retention |
| E08 Chất lượng/vận hành | P0 xuyên suốt | NFR-01..10 | Pipeline, môi trường, người trực |
| E09 Delivery | P2 | US-16, FR-14 | Policy COD, shipper, địa chỉ, ADR trừ tồn |
| E10 Tăng trưởng và AI nâng cao | P2 | FR-16, AI-01/03..09/11 | Dữ liệu hành vi, lô hàng, đánh giá, baseline |

## Definition of Ready / Done

Ready: có chủ yêu cầu, UI/input/output, quyền, lỗi, tiêu chí nghiệm thu, dữ liệu mẫu và phụ thuộc đã giải quyết. Done: có mã được review, migration/hợp đồng cập nhật khi cần, test rủi ro chính qua, không lộ secret, có telemetry và tài liệu vận hành của thay đổi.

## Phân công trách nhiệm đề xuất

Product owner duyệt scope/policy; vận hành store duyệt quy trình soạn/nhận; backend chịu invariant tồn/tiền/quyền; frontend chịu trải nghiệm và khôi phục lỗi; AI owner duyệt dataset/model/prompt; QA tổ chức regression/UAT; người vận hành triển khai/backup/incident. Một người có thể kiêm nhiệm nhưng mọi trách nhiệm phải có tên trước pilot.

## Nhánh kiến trúc sau pilot

| Mốc | Công việc | Điều kiện hoàn thành |
| --- | --- | --- |
| A01 Chuẩn hóa sự kiện | Envelope/version, outbox/inbox, mapping ownership, contract tests | Event lặp/crash/retry có kết quả kiểm chứng; event không chứa PII thừa |
| A02 Broker và consumer | PoC Kafka/RabbitMQ; tách Notification/analytics/AI jobs khi có lợi ích | Chọn broker qua ADR; dashboard lag/DLQ, replay an toàn, người vận hành |
| A03 Search và kho dữ liệu | PoC Elasticsearch/OpenSearch, vector index, warehouse theo nhu cầu | Chất lượng tốt hơn baseline theo mục tiêu; có rebuild/retention và nguồn chuẩn rõ |
| A04 Clients và delivery | Chọn Flutter/React Native, maps; thiết kế Shipper App và COD | Kiểm chứng camera/offline/ETA và hợp đồng API, không kéo vào exit criteria MVP |
| A05 Tách dịch vụ giao dịch | Saga checkout/handover, DB ownership, backfill/cutover, reconciliation | Failure injection và TC-M01..M10 đạt; rollback diễn tập; tương thích API |
| A06 Agent vận hành | Phân công, pricing, fraud, delivery agents | Dataset/gate, quyền phê duyệt, audit, fallback và kill switch riêng |

Thời điểm các mốc dựa trên số liệu vận hành và năng lực đội, chưa gắn sprint cam kết. Chi tiết ở [kiến trúc đích](../02-kien-truc/microservices-va-su-kien.md) và [multi-agent](../06-ai/kien-truc-multi-agent.md).
