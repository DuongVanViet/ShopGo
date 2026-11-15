# Công nghệ đề xuất và tiêu chí lựa chọn

## Cách sử dụng

Đây là danh mục phương án theo định hướng dự án, chưa phải cấu hình đã được cài hoặc quyết định mua dịch vụ. Không yêu cầu dùng đồng thời mọi công nghệ trong cùng một hàng. Bản này không chốt phiên bản, giá, khả năng thanh toán tại từng thị trường hoặc điều kiện nhà cung cấp; cần kiểm tra tài liệu chính thức và hợp đồng tại thời điểm lựa chọn.

MVP tiếp tục thiết kế theo Next.js/TypeScript/Tailwind, NestJS, FastAPI, PostgreSQL và Redis. Các lựa chọn khác là phương án so sánh khi có yêu cầu cụ thể, không tạo nhiều backend stack cho cùng chức năng.

| Tầng | Phương án từ định hướng dự án | Phạm vi đề xuất / điều kiện quyết định |
| --- | --- | --- |
| Mobile | Flutter hoặc React Native | Sau Web MVP; chọn một theo kỹ năng đội, camera/barcode, push, bản đồ, offline và chi phí bảo trì hai nền tảng |
| Web | React / Next.js | Dùng Next.js + React + TypeScript + Tailwind theo cấu trúc repo; responsive cho khách và nhân sự ban đầu |
| Backend | NestJS hoặc Spring Boot / Go | Dùng NestJS cho MVP; chỉ đổi/tách runtime nếu có đội sở hữu và benchmark chứng minh lợi ích |
| AI services | Python + FastAPI | API suy luận/orchestration và worker ML; domain writes qua backend tools |
| Quan hệ | PostgreSQL | Đơn, tồn, tiền, quyền và outbox; transaction/constraint kiểm chứng bằng integration test |
| Cache / realtime | Redis, WebSocket | Cache/queue tạm thời và đẩy cập nhật; backend API vẫn là nguồn trạng thái chuẩn |
| Search | Elasticsearch hoặc OpenSearch | Bổ sung khi benchmark truy vấn/corpus cần index chuyên dụng; trước đó tìm kiếm cơ bản theo DB |
| Vector | pgvector, Qdrant hoặc Pinecone | Thử pgvector trong spike nếu muốn giảm số hệ thống; so với hai phương án còn lại bằng corpus, bộ lọc scope, backup, latency và ngân sách |
| Message broker | Kafka hoặc RabbitMQ | Chọn một khi tách consumer/dịch vụ; PoC phải có retry, replay, ordering, dedup và vận hành; BullMQ dành tác vụ MVP |
| Bản đồ / định tuyến | Google Maps, Goong hoặc OSRM | So sánh coverage khu pilot, geocoding, traffic cần thiết, điều khoản và chi phí; bản đồ trong store là dữ liệu khác bản đồ đường bộ |
| Hạ tầng | Docker, Kubernetes, AWS/GCP/Azure | Container hóa trước; chọn một cloud; Kubernetes chỉ khi nhu cầu vận hành và đội ngũ đáp ứng |
| CI/CD | GitHub Actions, ArgoCD | Pipeline CI theo repo; ArgoCD xem xét khi có GitOps/Kubernetes, không là phụ thuộc bắt buộc local/MVP |
| Giám sát | Prometheus, Grafana, ELK, Sentry | Chọn bộ đủ metrics/dashboard/log/error tracking theo ngân sách; truyền correlationId và che PII xuyên hệ thống |
| Thanh toán | VNPay, MoMo, ZaloPay, Stripe | Một cổng đầu tiên theo D03; kiểm chứng merchant onboarding, phương thức được hỗ trợ, webhook, refund và đối soát cho mô hình hoạt động thực tế |
| LLM | Claude API hoặc kết hợp mô hình mở | Adapter provider; chọn bằng eval tiếng Việt/tool use/RAG, latency, chi phí và quyền dữ liệu; không hard-code model trong nghiệp vụ |
| ML | PyTorch, scikit-learn, XGBoost, Prophet | Mỗi bài toán có baseline trước; chọn theo dataset và backtest, không mặc định mọi thư viện đều cần cài |

## Các spike cần thực hiện

| Spike | Dữ liệu/kịch bản | Kết quả quyết định |
| --- | --- | --- |
| Broker | OrderConfirmed fan-out, consumer crash, message trùng, replay lịch sử, DLQ | Báo cáo thời gian phục hồi, vận hành, ordering và tổng chi phí; chọn Kafka hoặc RabbitMQ |
| Search tiếng Việt | Query có/không dấu, lỗi gõ, đồng nghĩa, từ hiếm, lọc store/tồn | Recall@10, latency, index lag và quy trình rebuild; quyết định có cần search engine ngay |
| Vector/RAG | Chính sách có phiên bản, tài liệu nhiều store, thu hồi nguồn cũ | Độ đúng nguồn, lọc quyền, latency, backup và khả năng xóa/thu hồi |
| Payment | Callback giả/trễ/trùng, amount sai, refund thất bại, hai attempt đều thu | Xác nhận adapter đáp ứng TC-09..12/18/22 và công cụ reconciliation |
| Maps/delivery | Địa chỉ khu pilot, hẻm, thời gian cao điểm, tuyến nhiều điểm | Chất lượng địa chỉ/ETA, giới hạn dữ liệu, vận hành offline và ngân sách |
| LLM/ML | Dataset AI đã version, ngân sách 300k, injection, FAQ thiếu nguồn | Regression gate, latency/cost và dữ liệu được phép gửi provider |

## Tiêu chí chấm chung

Chấm từng phương án theo yêu cầu nghiệp vụ bắt buộc, khả năng đội vận hành, bảo vệ dữ liệu, cách phục hồi, khả năng thay thế và tổng chi phí theo tải dự kiến. Có tiêu chí loại ngay nếu không hỗ trợ quyền/scope cần thiết hoặc không có cách đối soát đáng tin cậy. Không chọn chỉ theo benchmark quảng cáo hoặc độ phổ biến.

Ghi kết quả PoC, phiên bản thử, dữ liệu, môi trường, người quyết định và ngày vào ADR. Các phiên bản runtime/dependency phải được pin khi có mã, và cập nhật `.env.example`, pipeline, runbook tương ứng.
