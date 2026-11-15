# Quy ước API

## Hợp đồng chung

- Prefix `/api/v1`; JSON camelCase, UTF-8. Endpoint liệt kê trong tài liệu là đề xuất cho hợp đồng OpenAPI khi triển khai.
- ID dạng UUID, tiền nguyên VND. Thời gian ISO 8601, ví dụ `2026-11-12T10:00:00+07:00`; server chuẩn hóa UTC.
- Danh sách dùng cursor và limit mặc định 20, tối đa 100; response gồm items và nextCursor. Sort ổn định bằng createdAt + id nếu có thể.
- Mỗi request trả `X-Request-Id`. API không lộ stack trace, secret, cấu trúc SQL hoặc thông tin tài khoản không cần thiết.
- Auth bằng phiên đã xác minh; scope cửa hàng lấy từ membership, scope khách lấy từ chủ sở hữu tài nguyên. Chi tiết cookie/CSRF theo kiến trúc xác thực được chốt.

## Response và lỗi

```json
{
  "data": { "id": "8d16ca94-607d-4f13-916e-cc665d85bb64", "status": "CONFIRMED", "version": 1 },
  "meta": { "requestId": "req-example-001" }
}
```

```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Sản phẩm không còn đủ số lượng.",
    "details": [{ "skuId": "8f9981a4-3d56-4416-8904-09af8d38f900", "available": 0 }]
  },
  "meta": { "requestId": "req-example-002" }
}
```

| HTTP | Ý nghĩa | Mã nghiệp vụ ví dụ |
| --- | --- | --- |
| 400 | JSON/tham số sai | VALIDATION_ERROR |
| 401 | Chưa có phiên hợp lệ | AUTH_REQUIRED, SESSION_EXPIRED |
| 403 | Không có quyền | FORBIDDEN, STORE_SCOPE_DENIED |
| 404 | Không có tài nguyên được phép xem | NOT_FOUND |
| 409 | Xung đột tồn/trạng thái/version | OUT_OF_STOCK, SLOT_FULL, VERSION_CONFLICT, INVALID_TRANSITION, QR_ALREADY_USED |
| 410 | Tài nguyên có hạn đã hết hiệu lực | QUOTE_EXPIRED, QR_EXPIRED |
| 422 | Không thỏa điều kiện nghiệp vụ | VOUCHER_INELIGIBLE, PAYMENT_AMOUNT_MISMATCH |
| 429 | Quá giới hạn | RATE_LIMITED; có Retry-After |
| 503 | Phụ thuộc tạm lỗi | PAYMENT_UNAVAILABLE, AI_UNAVAILABLE |

Chọn 404 thay vì lộ sự tồn tại của đơn người khác. Webhook có quy ước ACK riêng theo cổng; không dùng redirect browser như webhook.

## Chống lặp và cập nhật đồng thời

`Idempotency-Key` bắt buộc cho tạo đơn, tạo payment attempt, hủy, bàn giao, thu tiền, hoàn tiền và điều chỉnh tồn. Khóa gắn principal + operation + payload hash; cùng khóa/cùng payload trả cùng kết quả, khác payload trả 409 IDEMPOTENCY_CONFLICT. Request đang chạy trả trạng thái chờ theo hợp đồng, không thực hiện lần hai. Thời gian lưu đề xuất tối thiểu 24 giờ; dedup nghiệp vụ tiền/QR tồn tại lâu hơn khóa HTTP.

Resource có version phải gửi expectedVersion trong thao tác ghi. Bản cũ trả VERSION_CONFLICT để client tải lại. Không retry tự động một lỗi nghiệp vụ bằng key mới khi chưa biết kết quả cũ.

## Ví dụ checkout

```http
POST /api/v1/orders
Idempotency-Key: checkout-example-001
Content-Type: application/json
```

```json
{
  "quoteId": "26a1a943-9c05-47ba-ac62-e38b1dd9722b",
  "paymentMethod": "ONLINE",
  "expectedCartVersion": 3
}
```

Response 201 gồm orderId, code, status, paymentStatus, expiresAt và version. Payment redirect/session được lấy từ endpoint attempt riêng; lỗi khởi tạo thanh toán không làm mất đơn đã được giữ tồn. PaymentMethod MVP là ONLINE hoặc PAY_AT_PICKUP; provider được lựa chọn phía cấu hình server.

## Realtime và webhook

Sự kiện client gồm eventId, type, entityId, version, occurredAt; không gửi toàn bộ dữ liệu cá nhân. Client bỏ sự kiện version cũ và đọc lại API khi nghi ngờ mất sự kiện. Đăng ký kênh phải được kiểm tra ownership/store scope.

Webhook payment giới hạn kích thước body, xác minh trên bytes gốc nếu hợp đồng yêu cầu, kiểm tra chống replay và lưu inbox bền vững trước ACK theo hợp đồng nhà cung cấp. Event trùng được ACK an toàn; payload/chữ ký sai không cập nhật đơn và được ghi cảnh báo đã che dữ liệu.
