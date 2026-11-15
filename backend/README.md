# ShopGo Backend

Backend NestJS + TypeScript + PostgreSQL theo đặc tả trong `docs`. Đây là backend MVP chạy local cho Click & Collect; các tích hợp bên ngoài và phần mở rộng được ghi rõ bên dưới.

## Thành phần đã hiện thực

| Nhóm | Chức năng |
| --- | --- |
| Database | Migration SQL có checksum và khóa migration; 43 bảng nghiệp vụ/hạ tầng cùng bảng schema_migrations; FK, CHECK, index và trigger lịch sử bất biến |
| Auth | Đăng ký USER/SELLER; MANAGER/Admin cấp STAFF; login SĐT/email + mật khẩu scrypt; OTP local, phiên Bearer hash, rotate/logout và membership theo store |
| Catalog | Discovery sản phẩm trên mọi cửa hàng; danh mục/SKU, tìm chữ có/không dấu, giá và available theo store; cursor UUID hoặc cursor ghép store–SKU |
| Cart | Giỏ một user/store, sửa số lượng theo version, đổi store qua preview, quote có hạn và giá server |
| Checkout | Giữ tồn, slot, voucher, snapshot đơn và outbox trong một transaction; khóa idempotency + payload hash; retry serialization/deadlock |
| Orders | Ownership, timeline, hủy trước soạn, giải phóng tồn/slot/quota, nghĩa vụ hoàn tiền khi cần |
| Fulfillment | Claim/reassign, quét SKU, báo thiếu/hỏng, READY, QR hash dùng một lần/cấp lại, CASH collection và handover nguyên tử |
| Payment | **Simulator local**: attempt, HMAC webhook, inbox chống trùng, xử lý đến muộn, refund request và xác nhận refund sandbox |
| Quản trị | Seller tự tạo danh mục/sản phẩm và cấp tài khoản nhân viên trong đúng store; admin truy cập vận hành/cấp Manager; chỉnh giá, tồn và sức chứa slot; audit và báo cáo tiền riêng doanh thu đơn hoàn tất |
| Worker | Thu hồi đơn online hết hạn từ DB, materialize outbox thành thông báo IN_APP có dedup; nhiều worker dùng SKIP LOCKED |
| Hỗ trợ/AI | Ticket/thông báo cá nhân, conversation có ownership; AI Gateway có timeout/kiểm chứng SKU/nguồn; proposal giỏ có xác nhận, giá/tồn/version và chống apply trùng; recommendation baseline |
| HTTP | `/api/v1`, validation Zod strict, requestId, lỗi có code, envelope camelCase, CORS allowlist, Helmet, Swagger non-production |

Số bảng có thể kiểm tra từ migration; dữ liệu delivery, loyalty, review và lô hàng chưa thuộc schema MVP. PostgreSQL là nguồn chuẩn; không cần Redis để chạy phiên bản này. Worker DB thay queue bên ngoài ở giai đoạn đầu, chưa tích hợp BullMQ/Kafka/RabbitMQ.

## Chạy trên Windows

Cần Docker Desktop và Node.js 22.14+ cùng npm. Script PowerShell tự nhận runtime portable trong `.tools/node-v22.14.0-win-x64` nếu có; thư mục này không được commit. Chạy từ thư mục gốc project:

Nếu PowerShell báo `running scripts is disabled`, dùng launcher `.cmd` tương ứng mà không đổi ExecutionPolicy:

```powershell
& "C:\Users\vanvi\ShopGo\scripts\backend.cmd" dev
```

Launcher `.cmd` hỗ trợ cùng các tác vụ `install`, `build`, `dev`, `migrate`, `seed`, `worker`, `test` như `.ps1` và tự tìm Node portable. Với worker, mở terminal khác và thay `dev` bằng `worker`.

```powershell
docker compose up -d postgres
Copy-Item backend/.env.example backend/.env
# Điền AUTH_SECRET ngẫu nhiên; giữ OTP_MODE=local chỉ cho môi trường local.
./scripts/backend.ps1 install
./scripts/backend.ps1 migrate
```

Để tạo dữ liệu mẫu, đặt `SEED_ALLOW=true` trong `backend/.env`, sau đó:

```powershell
./scripts/backend.ps1 seed
./scripts/backend.ps1 dev
```

Mở terminal khác chạy worker:

```powershell
./scripts/backend.ps1 worker
```

API mặc định `http://localhost:3001/api/v1`; Swagger `http://localhost:3001/api/docs`, JSON spec `/api/docs-json`. Schema request và ví dụ thực tế nằm trong controller/test và phần dưới; Swagger hiện liệt kê route/auth, chưa mô tả đầy đủ từng trường request Zod.

Đã có [frontend Next.js](../frontend/README.md) để thử trực tiếp các luồng. Response chi tiết đơn bổ sung `store`, `slot` và `items[].barcode` để hiển thị địa điểm/giờ nhận và đối chiếu mã khi soạn.

Nếu dùng Node đã cài sẵn, các lệnh tương ứng trong `backend`: `npm ci`, `npm run db:migrate`, `npm run db:seed`, `npm run start:dev`, `npm run worker`. Build bằng `npm run build`; chạy `npm start`. Image Docker hỗ trợ `node dist/database/migrate.js` và `node dist/jobs/worker.js` để chạy từng tiến trình riêng; cấp env thực tế khi chạy image.

## Dữ liệu mẫu

Tài khoản khách/seller tự đăng ký dùng `/auth/register` và đăng nhập `/auth/login` bằng mật khẩu, khác tài khoản seed OTP. Public signup không chấp nhận `STAFF`; MANAGER/Admin tạo nhân viên qua API store và cấp mật khẩu ban đầu. Migration 003 lưu email/loại tài khoản/mật khẩu đã băm và địa chỉ/tọa độ/owner của cửa hàng; migration 006 bổ sung STAFF và người cấp tài khoản. Seller có MANAGER cho cửa hàng của mình; GET /seller/store và PATCH /seller/store/location áp quyền chủ sở hữu. Xem [đặc tả đăng ký và bản đồ](../docs/05-thiet-ke-ui/dang-ky-dang-nhap-ban-do.md).

Seed tạo 2 store, 5 category, 50 SKU, 4 slot ngày mai mỗi store, voucher `DEMO10` và các tài khoản giả sau. Seed chạy lặp không reset tồn/đơn đã có; mỗi ngày có thể bổ sung slot mới. Dữ liệu lịch sử đơn/tiền ở từng trạng thái được tạo bởi kiểm thử, không tự chèn vào seed demo.

| Vai trò | SĐT giả để đăng nhập OTP local |
| --- | --- |
| Khách | +84900000000 |
| Picker | +84900000001 |
| Counter | +84900000002 |
| Manager có quyền refund | +84900000003 |
| Admin | +84900000004 |

Admin hệ thống được truy cập nghiệp vụ của store đang chọn; MANAGER kế thừa quyền Picker/Counter. Nhân viên PICKER/COUNTER chỉ có đúng phạm vi được cấp và không thể tạo tài khoản khác. Seed vẫn cấp membership riêng cho nhân sự ở hai store. SKU đầu tiên hết hàng, SKU thứ hai còn 1, còn lại 100. Thông tin sản phẩm chỉ là fixture giả.

## Seller tạo danh mục và sản phẩm

Seller đăng ký được cấp `MANAGER` cho đúng cửa hàng của mình. Migration 004 bổ sung phạm vi sở hữu cho danh mục; danh mục riêng có thể trùng slug với cửa hàng khác nhưng không thể được dùng chéo store. Các thao tác tạo yêu cầu Bearer session và `Idempotency-Key`.

| Endpoint | Nội dung |
| --- | --- |
| GET `/stores/{storeId}/catalog/categories` | Danh mục chung và danh mục của store; cần MANAGER |
| POST `/stores/{storeId}/catalog/categories` | Tạo danh mục store; backend tự sinh slug nếu không gửi |
| GET `/stores/{storeId}/catalog/products` | Danh sách chi tiết sản phẩm seller đang quản lý |
| POST `/stores/{storeId}/catalog/products` | Tạo product, SKU, giá, tồn và movement trong một transaction |
| POST `/stores/{storeId}/catalog/products/{productId}/image` | Tải hoặc thay ảnh chính JPEG/PNG/WebP, tối đa 5 MB; cần MANAGER của store |
| GET `/products` | Public discovery các offer đang mở bán của mọi cửa hàng; mỗi item kèm `store` và cursor ghép store–SKU |
| GET `/stores/{storeId}/products` | Catalog public chỉ của một cửa hàng, dùng sau khi khách chọn/vào cửa hàng |
| GET `/stores/{storeId}/categories` | Danh mục public đang có SKU active tại store |

Payload tạo sản phẩm:

```json
{
  "name": "Táo xanh túi 500g",
  "description": "Táo giòn, bảo quản mát.",
  "categoryId": "<UUID>",
  "sku": {
    "code": "TAO-XANH-500",
    "barcode": "8930000000001",
    "name": "Táo xanh túi 500g",
    "unit": "pack"
  },
  "price": 45000,
  "initialStock": 12
}
```

`storeId` chỉ lấy từ URL và được đối chiếu membership. Category phải là danh mục chung hoặc thuộc store đó. SKU/barcode là duy nhất; nếu bất kỳ bước nào lỗi thì product, giá và tồn đều rollback.

Ảnh gửi dưới dạng `multipart/form-data` với field `image`. Backend kiểm tra cả MIME và chữ ký tệp, sinh tên lưu trữ ngẫu nhiên trong `UPLOAD_DIR/products`, rồi trả `imageUrl` dạng `/api/v1/media/products/{storageKey}`. Khi thay ảnh, bản ghi được cập nhật nguyên tử và tệp cũ được dọn sau khi commit; danh sách quản lý và catalog public đều trả `imageUrl`. Migration 005 tạo bảng `product_images` để giữ metadata, không lưu binary trong PostgreSQL.

## Cấp tài khoản nhân viên

Nhân viên không tự đăng ký qua `/auth/register`. MANAGER của đúng cửa hàng gọi `POST /stores/{storeId}/staff` để tạo tài khoản `STAFF` và cấp `PICKER` hoặc `COUNTER`; admin hệ thống có thể cấp thêm `MANAGER`. Request cần Bearer token và `Idempotency-Key`, gồm `displayName`, ít nhất một trong `phone`/`email`, `password` ban đầu và `role`. User, password hash và membership được tạo trong cùng transaction; response và `GET /stores/{storeId}/staff` không bao giờ trả password/hash.

```json
{
  "displayName": "Nguyễn Thanh Bình",
  "phone": "0901234567",
  "email": "binh.staff@example.test",
  "password": "Initial-staff-passphrase!",
  "role": "PICKER"
}
```

Tài khoản STAFF đăng nhập bình thường tại `/auth/login`. System admin được truy cập các màn hình Manager/Picker/Counter theo store đang chọn; MANAGER kế thừa quyền Picker/Counter. PICKER/COUNTER không thể gọi API cấp tài khoản hoặc thao tác chéo cửa hàng.

## Ví dụ một vòng đơn hàng

Các JSON là request body, thay ID/version theo response thực tế. Các response thành công có `{data,meta:{requestId}}`. Header `Authorization: Bearer <accessToken>` dùng cho mọi API riêng tư. GET catalog và health không yêu cầu đăng nhập.

### 1. Login local

`POST /api/v1/auth/otp/request`:

```json
{ "phone": "+84900000000" }
```

Response local trả challengeId, expiresAt, **localCode**. Gửi `POST /auth/otp/verify` với `{ "challengeId": "<UUID>", "code": "<localCode>" }` để lấy accessToken. Mã không ghi log. Production cấm OTP local; hiện chưa có SMS/OTP provider thực.

Phiên hiện dùng opaque Bearer token, không phải JWT/cookie và không có refresh token dài hạn. `/auth/refresh` xoay chính phiên Bearer còn hạn và vô hiệu token cũ; hết hạn phải đăng nhập lại. Browser client nên giữ accessToken trong memory; không tự chuyển sang cookie mà chưa bổ sung CSRF. OAuth2/OIDC/JWT ở tài liệu kiến trúc là đích mở rộng.

### 2. Catalog, giỏ và quote

Lấy `GET /products` để khám phá offer của tất cả cửa hàng; endpoint public hỗ trợ `q`, `categoryId`, `inStock`, `limit` và `cursor`. Mỗi item trả giá/tồn của đúng offer cùng metadata `store` gồm `id`, `code`, `name`, `address`, `latitude`, `longitude`. `nextCursor` là giá trị opaque ghép `(storeId, skuId)` để không làm mất offer khi cùng một SKU được bán ở nhiều cửa hàng; client không tự giải mã hoặc tạo cursor.

Sau khi khách chọn cửa hàng, dùng `GET /stores/{storeId}/products` và `GET /stores/{storeId}/slots`; chọn SKU còn hàng và slot tương lai.

`GET /cart?storeId=<UUID>` tạo hoặc trả giỏ hiện hành. `PUT /cart/items/{skuId}`:

```json
{ "storeId": "<UUID>", "quantity": 1, "expectedVersion": 1 }
```

`POST /checkout/quotes` dùng version giỏ mới:

```json
{ "cartId": "<UUID>", "cartVersion": 2, "slotId": "<UUID>", "voucherCode": "DEMO10" }
```

Quote không reserve. Giá/tồn/slot/quota và cart version được kiểm tra lại lúc đặt. Chiết khấu MVP ở mức đơn, order item lineTotal lưu giá trước giảm voucher. Một SKU tối đa 1.000 đơn vị, tổng đơn tối đa 1.000.000.000.000 VND; backend chỉ hỗ trợ SKU đếm nguyên.

### 3. Checkout

`POST /orders` với header `Idempotency-Key` ngẫu nhiên 8–128 ký tự:

```json
{ "quoteId": "<UUID>", "paymentMethod": "PAY_AT_PICKUP", "expectedCartVersion": 2 }
```

Lưu orderId/version/itemIds từ response. Gửi lại cùng key và body trả cùng kết quả. Cùng key nhưng khác body bị từ chối. Không đổi key sau timeout khi chưa biết giao dịch cũ có thành công không.

### 4. Soạn

Login picker, gọi lần lượt và dùng version mới sau mỗi bước, header idempotency key riêng cho mỗi hành động:

- `POST /stores/{storeId}/orders/{id}/claim`: `{ "expectedVersion": 1 }`.
- `PUT /stores/{storeId}/orders/{id}/picking-items/{itemId}`: `{ "barcode": "<barcode SKU>", "pickedQuantity": 1, "expectedVersion": 2 }`.
- `POST /stores/{storeId}/orders/{id}/ready`: `{ "expectedVersion": 3 }` sau khi đủ mọi dòng.

Thiếu/hỏng báo `/issues`; manager có thể reassign hoặc hủy có xác nhận restock. Không tự thay hàng hoặc tăng tiền đơn đã chốt.

### 5. Thu và bàn giao

Khách lấy `GET /orders/{id}/pickup-token`, response có Cache-Control no-store. Login counter, `POST /stores/{storeId}/pickup/lookup` với `{ "token": "<QR token>" }` để xem trước.

`POST /stores/{storeId}/orders/{id}/collections`:

```json
{ "amount": 10000, "method": "CASH", "shiftReference": "CA-001", "expectedVersion": 4 }
```

Phải gửi đúng total server. Sau đó `/handover` với `{ "token": "<QR token>", "expectedVersion": 5 }`. Cả hai thao tác cần Idempotency-Key. Handover mới trừ onHand/reserved và dùng QR; slot FULFILLED vẫn chiếm capacity phục vụ ban đầu. Bấm lại không thu/trừ tồn lần nữa.

## Thanh toán sandbox

Đặt `PAYMENT_MODE=sandbox` và secret ngẫu nhiên `PAYMENT_WEBHOOK_SECRET` trong env, khởi động lại API. `POST /orders` có paymentMethod ONLINE tạo PENDING_PAYMENT; `POST /orders/{id}/payment-attempts` với expectedVersion và idempotency key tạo reference. Không có trang thu tiền thật.

Webhook `POST /webhooks/payments/sandbox` có body:

```json
{
  "eventId": "<UUID mới>",
  "reference": "<providerReference của attempt>",
  "merchant": "shopgo-local",
  "amount": 10000,
  "currency": "VND",
  "status": "PAID"
}
```

Header `X-Webhook-Timestamp` là Unix seconds, lệch tối đa 300 giây. `X-Webhook-Signature` là HMAC-SHA256 hex của chuỗi `timestamp + '.' + rawJSON` bằng PAYMENT_WEBHOOK_SECRET. Phải ký đúng bytes đã gửi; ví dụ ký/gửi nằm trong test tích hợp. Callback đến muộn tạo refund REQUESTED, không hồi sinh đơn. Simulator `confirm-sandbox` chỉ đánh dấu hoàn giả để thử quy trình; không chứng minh đã hoàn tiền thật.

## Các quy ước thao tác

- Mọi write quan trọng của đơn, fulfillment, stock, admin, refund và cấu hình slot/giá cần Idempotency-Key; sửa giỏ dùng expectedVersion.
- DELETE dòng giỏ dùng JSON body storeId/expectedVersion.
- Đổi store dùng sourceStoreId/targetStoreId/expectedVersion/confirm=false để preview; confirm=true phải kèm expectedTargetVersion từ preview. Giỏ đích bị thay bằng nội dung nguồn khi xác nhận; giỏ nguồn được giữ lại.
- Cursor hiện sort UUID tăng dần, không sort theo ngày tạo. Limit mặc định 20, tối đa 100.
- Report dùng from/to ISO có timezone, khoảng nửa mở `[from,to)`, tách completedOrderValue, onlineCollected, cashCollected và refunded.
- Số tiền JSON là integer an toàn; tiền DB bigint. Tổng/giảm giá luôn do backend tính.

## AI Gateway và đề xuất giỏ

Backend đã có adapter gọi một AI service tin cậy qua `AI_SERVICE_URL`, `AI_SERVICE_TOKEN` và deadline `AI_TIMEOUT_MS`. Không cấu hình thì `/messages` trả 503; không dùng câu trả lời mẫu thay cho AI. Hợp đồng `/chat`, dữ liệu được gửi và giới hạn kiểm chứng ở [AI_CONTRACT.md](AI_CONTRACT.md). Mô hình/agent/RAG chạy ở AI service riêng, chưa được triển khai tại đây.

Có thể kiểm tra quy trình proposal mà không cần model bằng `POST /assistant/proposals`:

```json
{ "storeId": "<UUID>", "items": [{ "skuId": "<UUID>", "quantity": 2 }], "budget": 300000 }
```

Response có id, expectedCartVersion, preview, addedTotal, cartTotal, expiresAt và confirmationToken. Giỏ chưa bị sửa. Ngân sách áp dụng cho các món thêm, tiền chưa gồm voucher/phí; UI phải hiển thị rõ cả tổng thêm và tổng giỏ. Đề xuất hết hạn sau 2 phút.

Sau khi khách xem và xác nhận, gọi `POST /assistant/proposals/{id}/apply`, kèm Idempotency-Key:

```json
{ "confirmationToken": "<token đã được trình cho khách>", "expectedCartVersion": 1 }
```

Backend xác minh ownership/token/hạn/version, kiểm tra lại giá và tồn, rồi cộng số lượng vào giỏ. Giá hoặc SKU đổi yêu cầu tạo proposal mới; apply không reserve hoặc tạo đơn. Khách vẫn phải qua quote/checkout riêng. Có thể lấy lại preview còn hiệu lực qua `GET /assistant/proposals/{id}` của chính chủ.

## Kiểm thử

```powershell
./scripts/backend.ps1 build
./scripts/backend.ps1 test
```

Integration test chạy PostgreSQL thật, mặc định local ở port 5433; có thể đổi TEST_DATABASE_URL sang DB test riêng. Mỗi lần chạy tạo schema `shopgo_test_<random>` và chỉ xóa schema đó lúc kết thúc; không truncate dữ liệu ứng dụng. Tài khoản DB test cần quyền CREATE SCHEMA. Không trỏ TEST_DATABASE_URL tới production.

Backend dùng `node:test` + `node:assert/strict`, thực thi TypeScript qua tsx; không cần native binding của Vite/Rolldown. Các lời gọi HTTP kiểm tra bằng Supertest, và các test đồng thời gửi request thật đến cổng ngẫu nhiên của API.

Test bao gồm auth/OTP, quyền chéo, quote stale, tranh chấp SKU/slot/voucher, idempotency đồng thời, picker claim, QR/collection/handover, stock constraint/immutable history, callback signature/duplicate/late, refund limits, expiry worker/outbox, report và AI fail-closed.

## Giới hạn hiện tại

- Chưa tích hợp OTP/SMS thật, VNPay/MoMo/ZaloPay/Stripe, email/push/Zalo hoặc model/RAG thực. Online và refund chỉ là simulator local; chat trả 503 khi chưa nối AI service.
- Chưa có đổi trả từng phần, hoàn tiền mặt tự động, giao hàng/shipper/COD, loyalty/review, hàng cân ký, tồn theo lô và tối ưu tuyến.
- Hủy đơn đã thu tiền mặt bị chặn bằng CASH_REFUND_REVIEW_REQUIRED để không mất nghĩa vụ hoàn; cần quy trình tiền mặt riêng trước mở nghiệp vụ đó.
- Chưa có OAuth2/OIDC/JWT, provider SSO, realtime WebSocket, hàng đợi ngoài DB, analytics warehouse và metrics stack. Client dùng polling trạng thái.
- Notification worker chỉ có consumer IN_APP trong transaction DB; không tuyên bố đã có dispatcher bên ngoài, retry/DLQ và provider reconciliation hoàn chỉnh.
- Chưa có kiểm chứng tải/SLA, restore drill hoặc khả năng triển khai production. Cần hoàn thiện các tích hợp và gate vận hành ở docs trước sử dụng thật.

Production config từ chối OTP local/payment sandbox và example secret; provider chưa có trả lỗi rõ ràng. Secret không commit. SQL migration không thay thế phân quyền tài khoản DB production: cần tách tài khoản migration với tài khoản ứng dụng theo quyền tối thiểu khi triển khai.
