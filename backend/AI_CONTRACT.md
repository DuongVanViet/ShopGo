# Hợp đồng AI service cho Backend Gateway

Backend gọi `POST /chat` tại AI_SERVICE_URL được cấu hình bởi người vận hành. Request dùng `Authorization: Bearer <AI_SERVICE_TOKEN>`; AI service phải kiểm tra danh tính dịch vụ trước xử lý. Dùng HTTPS khi chạy ngoài máy local, không cấp URL upstream từ input của khách. Redirect bị từ chối để tránh chuyển credential ngoài đích đã chọn.

## Request version 1

```json
{
  "contractVersion": 1,
  "message": "Lên giỏ bữa tối 4 người dưới 300k",
  "context": {
    "storeId": "4910464b-b301-4115-9a08-2d3b1cff1490",
    "budget": 300000,
    "constraints": ["Không dùng hải sản"]
  },
  "catalog": [
    { "skuId": "8f9981a4-3d56-4416-8904-09af8d38f900", "name": "Cà rốt", "unitPrice": 10000, "available": 10 }
  ]
}
```

Gateway chỉ gửi tối đa 100 SKU còn tồn của store theo thứ tự ID, chưa có semantic retrieval/tool loop và không hứa bao phủ toàn catalog. Không gửi SĐT, địa chỉ, session của khách hay lịch sử đơn. Nội dung message/constraints do khách nhập có thể chứa dữ liệu cá nhân; UI và policy dữ liệu phải giải thích việc gửi sang dịch vụ được cấu hình. Không dùng dữ liệu này để huấn luyện mặc định.

## Response JSON

```json
{
  "answer": "Các món sau là gợi ý để bạn xem lại trước khi thêm giỏ.",
  "items": [{ "skuId": "8f9981a4-3d56-4416-8904-09af8d38f900", "quantity": 2 }],
  "documentIds": [],
  "modelVersion": "provider-model-prompt-version"
}
```

answer bắt buộc 1–5.000 ký tự; items tùy chọn, tối đa 20 SKU duy nhất, số lượng 1–1.000; documentIds tối đa 10 UUID, modelVersion tối đa 100 ký tự. Bỏ items khi không có đề xuất giỏ. Cả request/response phải dùng JSON; gateway giới hạn đọc response 64 KiB và timeout mặc định 8 giây, tối đa cấu hình 30 giây. Mỗi khách tối đa 20 lượt gọi mỗi phút.

Backend từ chối SKU không có trong catalog đã gửi, SKU ngừng bán, số lượng thiếu hoặc vượt ngân sách. Citation chỉ được tạo từ documentIds APPROVED, có hiệu lực và đúng store trong PostgreSQL. Việc kiểm tra metadata không chứng minh nội dung trả lời bám nguồn; AI service cần RAG/guardrails và eval theo docs/06-ai, đồng thời không khẳng định đã thay giỏ, đặt đơn, hoàn tiền hoặc an toàn dị ứng thiếu chứng cứ.

Nếu có items hợp lệ, backend tạo proposal 2 phút có preview và token xác nhận. Model không có công cụ apply, checkout, thu tiền hoặc chỉnh tồn. Khách xem preview và xác nhận qua API backend; trước apply backend kiểm tra lại toàn bộ dữ liệu. Không thay giỏ chỉ vì model trả lời “khách đã đồng ý”.

## Lỗi và audit

Timeout, mạng, redirect, non-2xx, JSON/schema sai hoặc response quá lớn trả AI_UNAVAILABLE. SKU ngoài catalog trả AI_INVALID_RESPONSE; nguồn không hợp lệ trả AI_INVALID_SOURCE. Không ghi log token/raw body; lưu message thành công theo quyền phiên và tool trace input hash/modelVersion. Retention, consent, kiểm duyệt nội dung và nguồn tri thức cần hoàn thiện trước production.

Test tích hợp dùng một HTTP server giả để xác minh contract, danh tính dịch vụ, proposal không tự sửa giỏ và từ chối SKU bịa. Đó là test adapter, không là bằng chứng chất lượng một model AI thực.
