# Hướng dẫn triển khai dự kiến

## Trạng thái tài liệu

Backend MVP hiện đã có package manifest, Dockerfile, Compose PostgreSQL, migration SQL, seed và script PowerShell. Các lệnh local thực tế cùng giới hạn tích hợp nằm ở [Backend README](../../backend/README.md). Phần còn lại dưới đây là kế hoạch môi trường đầy đủ; Redis, provider thật, AI và các thành phần production chưa mặc định được triển khai.

## Môi trường

| Môi trường | Mục đích | Cách ly bắt buộc |
| --- | --- | --- |
| Local/dev | Phát triển với seed và dịch vụ giả/sandbox | DB, Redis, storage và API key riêng |
| Staging | E2E, UAT, kiểm tra migration/restore | Gần production về topology; không dùng dữ liệu khách thật mặc định |
| Production | Pilot rồi mở rộng | Secret riêng, TLS, giới hạn mạng, backup và phân quyền vận hành |

Topology ban đầu: reverse proxy/TLS, frontend, backend, worker, AI service, PostgreSQL, Redis. Worker có thể dùng cùng image backend nhưng tiến trình riêng. Storage ảnh/sản phẩm và bằng chứng giao hàng cần ACL, loại file/kích thước cho phép và URL hết hạn cho nội dung riêng tư.

## Danh mục cấu hình cần tạo

Tên dưới đây là quy ước đề xuất để viết `.env.example`; chưa phải biến đang được mã đọc.

| Nhóm | Cấu hình ví dụ | Yêu cầu |
| --- | --- | --- |
| Ứng dụng | APP_ENV, PUBLIC_APP_URL, API_BASE_URL, ALLOWED_ORIGINS | HTTPS production, allowlist origin cụ thể |
| DB/queue | DATABASE_URL, REDIS_URL, DB_POOL_SIZE | Không public DB/Redis ra Internet; tài khoản quyền tối thiểu |
| Auth | SESSION_SECRET, OTP_PROVIDER_KEY, OTP_TTL_SECONDS | Secret không có giá trị mẫu thật; TTL/rate limit theo quyết định D02 |
| Checkout | RESERVATION_TTL_SECONDS, QUOTE_TTL_SECONDS, PICKUP_TOKEN_TTL_SECONDS | Giá trị có kiểm tra hợp lệ, ghi trong release config |
| Payment | PAYMENT_PROVIDER, PAYMENT_MERCHANT_ID, PAYMENT_SECRET, PAYMENT_WEBHOOK_URL | Tách sandbox/live; verify theo adapter provider |
| AI | AI_SERVICE_URL, AI_SERVICE_TOKEN, MODEL_PROVIDER_KEY, MODEL_ID, AI_TIMEOUT_MS, AI_DAILY_BUDGET | Tắt được từng năng lực; không đưa key vào frontend |
| Giám sát | LOG_LEVEL, METRICS_ENDPOINT, ERROR_REPORTING_DSN | Che PII, auth cho metrics và retention |
| Storage/thông báo | STORAGE_BUCKET, NOTIFICATION_PROVIDER_KEY | Tách bucket/môi trường, hạn chế quyền |

## Trình tự local sau khi có mã

1. Pin runtime và package manager trong repo; frontend/backend dùng workspace, AI dùng môi trường Python độc lập.
2. Tạo env từ mẫu và điền secret sandbox ngoài Git. Kiểm tra không có endpoint production.
3. Khởi động DB/Redis; chạy migration từ nguồn duy nhất `backend/src/database`; seed dữ liệu giả có guard môi trường.
4. Khởi động backend, worker, AI và frontend; readiness phân biệt phụ thuộc cốt lõi với AI tùy chọn.
5. Smoke test danh mục, login test, đặt trả tại quầy, soạn, thu và bàn giao; sau đó test payment sandbox.

Các script `scripts/setup.ps1`, `dev.ps1`, `seed.ps1` sẽ hiện thực hóa trình tự này; không ghi script rỗng như đã hoàn tất chức năng.

## Pipeline và phát hành

CI đề xuất: cài phụ thuộc theo lockfile → lint/typecheck → test → build → kiểm tra migration/hợp đồng → tạo artifact theo commit. Không xuất secret ra log. Trước deploy staging phải có backup thử, bản migration và chiến lược rollback; production chỉ phát hành sau UAT và các quyết định P0 được chốt.

Migration dùng expand/contract khi có đổi cấu trúc phá tương thích: thêm cột/bảng → deploy mã tương thích hai phiên bản → backfill kiểm chứng → chuyển đọc/ghi → xóa cấu trúc cũ ở release sau. Không rollback ứng dụng về version không hiểu schema hiện tại. Destructive migration cần backup/restore đã thử và kế hoạch bảo toàn dữ liệu mới.

Sau deploy: kiểm tra readiness, tỷ lệ lỗi, outbox/queue lag, đặt test có kiểm soát theo chính sách môi trường và xác minh webhook. Canary trước mở toàn lưu lượng khi hạ tầng hỗ trợ. Nếu rollback, dừng tính năng mới, giữ xử lý callback/đối soát an toàn và xác định rõ các tác vụ nền vẫn phải chạy.

## Checklist trước pilot

- Chốt policy hủy/no-show/hoàn, secret live và webhook URL, quyền thu/hoàn và nhân sự chịu trách nhiệm.
- Kiểm kê tồn và capacity slot; nhập danh mục, giá, giờ hoạt động; đào tạo picker/counter.
- Backup có mã hóa và quyền truy cập; restore drill đạt mục tiêu; dashboard/cảnh báo có người nhận.
- Retention/dữ liệu cá nhân, hỗ trợ khách, đối soát và quy trình sự cố được duyệt.
- Không còn lỗi blocker, regression tiền/tồn/quyền đạt; có phương án tạm dừng nhận đơn tại từng store.

## Bổ sung khi chuyển sang kiến trúc đích

Thiết kế cloud/broker/gateway theo [ma trận công nghệ](../02-kien-truc/cong-nghe-de-xuat.md), chưa mặc định Kubernetes hay ArgoCD cho pilot. Khi có broker: cấu hình TLS, danh tính producer/consumer riêng, quyền topic/queue, retention, retry/DLQ, dashboard lag và backup/rebuild phù hợp. Khi có Kubernetes/GitOps: manifest, resource requests/limits, probes, secret integration và rollback cần được kiểm thử trước sử dụng production.

Mỗi service tách ra có owner, cấu hình, migration pipeline và rollout riêng. Trước cutover có snapshot/backfill, đối soát, shadow-read nếu phù hợp và một đường ghi chuẩn; không cho cả monolith và service mới ghi độc lập cùng nghiệp vụ. Chỉ bật route gateway sau gate hợp đồng/saga/failure test. Search/vector/warehouse cần đường rebuild từ nguồn có kiểm soát và không cấp quyền truy cập công khai mặc định.
