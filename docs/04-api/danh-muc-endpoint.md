# Danh mục endpoint đề xuất

Tất cả đường dẫn dưới đây theo prefix `/api/v1`. Public chỉ đọc catalog; checkout và mọi thao tác ghi giỏ yêu cầu phiên. Các route seller catalog bên dưới đã được hiện thực; phần mở rộng sau MVP được tách ở cuối tài liệu.

## Tài khoản và mua hàng

| Method / path | Quyền | Input chính | Kết quả/điều kiện |
| --- | --- | --- | --- |
| POST /auth/register | Public, rate limit | accountType USER/SELLER, thông tin liên hệ, password; seller kèm address/location confirmed | Tạo tài khoản/session; seller thêm store và MANAGER nguyên tử; không chấp nhận STAFF |
| POST /auth/login | Public, rate limit | identifier, password | Login SĐT/email; thông báo sai thông tin chung |
| GET /seller/store | Chủ sở hữu | — | Thông tin/ghim riêng của cửa hàng mình |
| PATCH /seller/store/location | Chủ sở hữu | address, location, expectedVersion | Idempotency-Key, không cho sửa cửa hàng khác |
| POST /auth/otp/request | Public, rate limit | phone | 202, không tiết lộ tài khoản có tồn tại |
| POST /auth/otp/verify | Public, rate limit | challengeId, code | Phiên mới; mã một lần, hết hạn/sai giới hạn bị từ chối |
| POST /auth/refresh | Có refresh session | Cookie, CSRF theo thiết kế | Rotation phiên; phát hiện reuse |
| POST /auth/logout | Có phiên | Session | Thu hồi refresh session, xóa cookie |
| GET /me | Có phiên | — | Hồ sơ và membership được phép |
| GET /stores | Public | query, lat/lng tùy chọn, cursor | Cửa hàng hoạt động và giờ mở |
| GET /products | Public | q, categoryId, inStock, cursor | Tìm offer từ mọi cửa hàng; trả kèm store, giá và tồn riêng của từng nơi; `q` tìm theo tên, SKU, barcode, mô tả, danh mục và tên cửa hàng |
| GET /stores/{storeId}/products | Public | q, categoryId, inStock, cursor | Tìm trong một cửa hàng theo tên, SKU, barcode, mô tả hoặc danh mục; trả giá/tồn tại store và thời điểm cập nhật |
| GET /stores/{storeId}/categories | Public | — | Chỉ danh mục có SKU active tại store |
| GET /stores/{storeId}/products/{skuId} | Public | — | Chi tiết SKU và available |
| GET /stores/{storeId}/slots | Public | date, method=PICKUP | Slot còn nhận đơn, sức chứa khả dụng |
| GET /cart | Khách | storeId | Giỏ và version; mỗi dòng trả `unit` và `imageUrl` ảnh chính giống catalog để frontend hiển thị nhất quán |
| PUT /cart/items/{skuId} | Khách | storeId, quantity, expectedVersion | Upsert số lượng; không giữ tồn |
| DELETE /cart/items/{skuId} | Khách | storeId, expectedVersion | Xóa dòng và tăng version |
| POST /cart/switch-store | Khách | targetStoreId, expectedVersion, confirm | Preview chênh lệch khi confirm=false; chỉ đổi khi xác nhận |
| POST /checkout/quotes | Khách | cartId, cartVersion, slotId, voucherCode? | Quote, breakdown, expiresAt; không reserve |
| POST /orders | Khách | quoteId, paymentMethod, expectedCartVersion | 201; nguyên tử tồn/slot/voucher/đơn, idempotent |
| GET /orders | Khách | cursor, status? | Chỉ đơn của mình |
| GET /orders/{id} | Chủ đơn hoặc nhân sự có scope | — | Trạng thái, timeline và dữ liệu theo quyền |
| POST /orders/{id}/cancel | Chủ đơn/manager có quyền | reason, expectedVersion | Hủy hợp lệ, giải phóng giữ chỗ, tạo yêu cầu hoàn nếu cần |
| POST /orders/{id}/payment-attempts | Chủ đơn | expectedVersion | Payment session cho đơn chưa trả còn hạn; có idempotency |
| GET /orders/{id}/pickup-token | Chủ đơn | — | QR hiện hành nếu READY; Cache-Control no-store |
| POST /orders/{id}/pickup-token/rotate | Chủ đơn/manager có quyền | expectedVersion, reason? | Thu hồi token cũ, cấp mới, audit |
| POST /support/cases | Khách | orderId?, category, message | Ticket hỗ trợ/đổi trả, không tự duyệt hoàn |

## Vận hành cửa hàng

Các path có storeId đều kiểm tra membership; orderId phải thực sự thuộc store đó. Admin hệ thống được truy cập nghiệp vụ của store đang chọn; MANAGER kế thừa quyền màn hình Picker/Counter. Tài khoản STAFF chỉ đăng nhập bằng thông tin do MANAGER/Admin cấp và không được gọi API cấp tài khoản.

| Method / path | Quyền | Input/kết quả chính |
| --- | --- | --- |
| GET /stores/{storeId}/orders | Picker/Counter/Manager | Lọc trạng thái/phân công, dữ liệu giới hạn theo vai trò |
| POST /stores/{storeId}/orders/{id}/claim | Picker | expectedVersion; nhận soạn duy nhất và chuyển PICKING |
| PUT /stores/{storeId}/orders/{id}/picking-items/{itemId} | Picker được phân công | barcode, pickedQuantity, expectedVersion; chống sai SKU |
| POST /stores/{storeId}/orders/{id}/issues | Picker/Manager | missing/damaged, itemId, quantity, note; tạo sự cố |
| POST /stores/{storeId}/orders/{id}/ready | Picker được phân công | expectedVersion; chỉ READY khi đủ dòng |
| POST /stores/{storeId}/pickup/lookup | Counter | token trong body; xem trước đơn, không tiêu thụ QR |
| POST /stores/{storeId}/orders/{id}/collections | Counter | amount, method, expectedVersion; thu tại quầy, idempotent |
| POST /stores/{storeId}/orders/{id}/handover | Counter | token, expectedVersion; hoàn tất và trừ tồn nguyên tử |
| POST /stores/{storeId}/orders/{id}/reassign | Manager | pickerId, reason, expectedVersion; audit |
| POST /stores/{storeId}/orders/{id}/cancel | Manager | reason, restockConfirmed khi đã soạn, expectedVersion |
| GET /stores/{storeId}/inventory | Manager | q, lowStock, cursor; số dư và version |
| GET /stores/{storeId}/catalog/categories | Manager | Danh mục chung và danh mục thuộc store |
| POST /stores/{storeId}/catalog/categories | Manager | name, slug?; tạo danh mục riêng, idempotent |
| GET /stores/{storeId}/catalog/products | Manager | Chi tiết product/SKU/category/giá/tồn theo store |
| POST /stores/{storeId}/catalog/products | Manager | categoryId, tên/mô tả, SKU/barcode/unit, giá, tồn ban đầu, hạn gần nhất tùy chọn; nguyên tử và idempotent |
| PATCH /stores/{storeId}/catalog/products/{skuId} | Manager | Sửa tên, mô tả, danh mục, SKU/barcode/unit, giá, trạng thái bán, `expiresOn`; dùng `expectedVersion`, idempotency và audit |
| POST /stores/{storeId}/catalog/products/{productId}/image | Manager | multipart field `image`; JPEG/PNG/WebP tối đa 5 MB; tải mới hoặc thay ảnh chính |
| GET /stores/{storeId}/staff | Manager/Admin | Danh sách tài khoản nhân viên và vai trò của đúng cửa hàng; không trả password/hash |
| POST /stores/{storeId}/staff | Manager/Admin | displayName, phone/email, password ban đầu, role; MANAGER chỉ cấp PICKER/COUNTER, admin hệ thống được cấp thêm MANAGER; idempotent |
| POST /stores/{storeId}/inventory/adjustments | Manager | skuId, delta, reason, expectedVersion; không dưới reserved |
| POST /stores/{storeId}/inventory/{skuId}/write-offs | Manager | Loại một phần hàng khỏi tồn bằng `quantity`, lý do `EXPIRED`/`DAMAGED` và ghi chú tùy chọn; idempotent, audit đầy đủ, không được trừ vào lượng đang giữ cho đơn |
| PUT /stores/{storeId}/products/{skuId} | Manager | price, active, expectedVersion; thay giá chỉ tác động quote mới |
| POST /stores/{storeId}/slots | Manager | startsAt, endsAt, capacity; không trùng policy slot |
| PATCH /stores/{storeId}/slots/{id} | Manager | capacity, expectedVersion; không thấp hơn allocatedCount |
| GET /stores/{storeId}/reports/summary | Manager | from, to; doanh thu hoàn tất, tiền thu/hoàn riêng |
| POST /stores/{storeId}/refunds | Manager có hạn mức | paymentId, amount, reason; idempotent, không hoàn vượt thu |

## Quản trị, tích hợp và AI

| Method / path | Quyền | Mục đích |
| --- | --- | --- |
| POST /admin/stores | Admin | Tạo cửa hàng; code duy nhất |
| POST /admin/memberships | Admin/Manager giới hạn | Cấp vai trò theo store, cấm tự nâng quyền |
| POST /admin/products | Admin có quyền catalog | Tạo product/SKU, kiểm tra mã |
| POST /admin/vouchers | Admin/Manager theo scope | Tạo policy voucher và quota |
| GET /admin/reports/summary | Admin có quyền báo cáo | Tổng hợp theo phạm vi được cấp |
| POST /webhooks/payments/{provider} | Chữ ký provider | Inbox, xác minh tiền/reference, xử lý idempotent |
| POST /assistant/conversations | Khách | Tạo phiên chat gắn chủ sở hữu và store |
| POST /assistant/conversations/{id}/messages | Chủ phiên | message, budget?, constraints?; trả gợi ý, nguồn, proposal |
| POST /assistant/proposals | Khách | storeId, items, budget?; preview giỏ có hạn, chưa thay giỏ |
| GET /assistant/proposals/{id} | Chủ proposal | Lấy lại preview/token còn hạn; không cache |
| POST /assistant/proposals/{id}/apply | Chủ proposal | confirmationToken, expectedCartVersion; xác minh lại rồi thêm giỏ |
| GET /recommendations | Khách hoặc public theo policy | storeId, context; fallback bán chạy/còn hàng |
| GET /health/live | Probe nội bộ | Tiến trình còn sống |
| GET /health/ready | Probe nội bộ | DB và phụ thuộc tối thiểu sẵn sàng |

## Endpoint mở rộng sau MVP

Thiết kế thêm `/delivery/jobs`, `/delivery/jobs/{id}/accept`, `/reject`, `/pickup`, `/complete`, `/proofs` và `/cod/settlements` khi chốt workflow giao hàng. Mở rộng `/returns`, `/loyalty`, `/reviews`, `/search/image`, `/forecasts`, `/promotion-suggestions`, `/fraud/reviews`, `/review-insights` sau khi có model dữ liệu, quyền và test tương ứng. Không công bố route chưa triển khai như khả năng sẵn có.
