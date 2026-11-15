# Từ điển dữ liệu cốt lõi

Các trường dưới đây là tối thiểu của mô hình đề xuất. PK/FK, kiểu và check constraint phải được thể hiện lại trong migration khi triển khai; đây chưa phải SQL thực thi.

| Bảng | Trường quan trọng | Kiểu và ràng buộc |
| --- | --- | --- |
| users | id, phone_normalized, display_name, status | UUID; phone unique khi có; ACTIVE/LOCKED/DEACTIVATED |
| users — migration 003 | email_normalized, password_hash, account_type | Email chuẩn hóa unique; hash scrypt, legacy OTP có thể null; USER/SELLER, không nhận quyền admin từ signup |
| users — migration 006 | account_type, created_by_user_id | Bổ sung STAFF; tài khoản nhân viên chỉ do MANAGER đúng store hoặc admin hệ thống cấp, lưu người cấp để audit; public signup không nhận STAFF |
| store_memberships | user_id, store_id, role | FK; unique bộ ba; role PICKER/COUNTER/MANAGER, quyền admin hệ thống quản lý riêng |
| stores | code, name, address, timezone, status | code unique; timezone mặc định Asia/Ho_Chi_Minh; ACTIVE/PAUSED |
| stores — migration 003 | owner_user_id, contact_phone, contact_email, address_details, latitude, longitude, location_source, location_accuracy_meters, location_confirmed_at, location_version | Owner FK users; cặp tọa độ WGS84 trong phạm vi; seller store cần ghim đã xác nhận, cập nhật có version |
| categories — migration 004 | name, slug, owner_store_id | Danh mục chung có owner null; danh mục seller FK store; slug unique riêng trong phạm vi global hoặc từng store |
| product_images — migration 005 | product_id, storage_key, mime_type, byte_size, original_name, created_at, updated_at | Một ảnh chính/product; metadata trong PostgreSQL, binary lưu tại `UPLOAD_DIR/products`; chỉ JPEG/PNG/WebP tối đa 5 MB |
| skus | product_id, code, barcode, unit, active | code unique; unit MVP là đơn vị đếm; không nhận qty lẻ |
| store_skus | store_id, sku_id, price, active | unique store/SKU; price bigint ≥ 0 |
| inventory_balances | store_id, sku_id, on_hand, reserved, version | bigint không âm; reserved ≤ on_hand; version tăng khi ghi |
| inventory_reservations | order_id, store_id, sku_id, quantity, status, expires_at | quantity > 0; unique order/SKU; expires_at bắt buộc khi ACTIVE |
| stock_movements | store_id, sku_id, delta_on_hand, delta_reserved, reason, reference_id, actor_id | Bất biến; reason RECEIPT/ADJUSTMENT/RESERVE/RELEASE/HANDOVER; unique reference hành động |
| carts | user_id, store_id, status, version | Một giỏ ACTIVE mỗi user/store; trạng thái CONVERTED sau checkout |
| cart_items | cart_id, sku_id, quantity | unique cart/SKU; quantity > 0, giới hạn tối đa cấu hình |
| checkout_quotes | cart_id, cart_version, pricing_version, totals, slot_id, expires_at, consumed_order_id | Snapshot server; không nhận totals từ client |
| orders | code, user_id, store_id, status, fulfillment_method, slot_id, totals, version, expires_at | code unique dễ tra cứu; PICKUP/DELIVERY; expiry cho online chưa trả |
| order_items | order_id, sku_id, sku_code, name, unit_price, quantity, discount, line_total, picked_quantity | Snapshot; 0 ≤ picked_quantity ≤ quantity |
| picking_assignments | order_id, picker_id, status, assigned_at, completed_at | Một assignment ACTIVE/đơn qua partial unique index |
| fulfillment_slots | store_id, method, starts_at, ends_at, capacity, allocated_count | starts < ends; 0 ≤ allocated_count ≤ capacity |
| slot_bookings | order_id, slot_id, status | order unique; ACTIVE/RELEASED/FULFILLED |
| payment_attempts | order_id, provider, provider_reference, amount, currency, status | reference unique theo provider; tiền của attempt bất biến |
| payment_webhook_inbox | provider, provider_event_id, payload_hash, received_at, processed_at | unique provider/event; lưu payload đã che lọc khi cần điều tra |
| counter_collections | order_id, amount, method, collected_by, collected_at | Một collection thành công/đơn MVP; unique request key; có tham chiếu ca thu |
| refunds | payment_attempt_id, amount, reason, status, provider_reference | Tổng hoàn thành công + đang xử lý không vượt tiền thu hợp lệ |
| pickup_tokens | order_id, token_hash, expires_at, used_at, revoked_at | Hash unique; tối đa một token chưa thu hồi còn hiệu lực theo policy |
| vouchers | code, discount_type, value, max_discount, min_total, quota, valid_from, valid_until | Code unique; PERCENT/FIXED; phần trăm 0..100; quota ≥ 0 |
| voucher_redemptions | voucher_id, order_id, user_id, status | unique order; RESERVED/COMMITTED/RELEASED; quota giữ nguyên tử |
| order_events | order_id, from_status, to_status, actor_id, reason, request_id | Append-only; không cho cập nhật từ API quản trị thông thường |
| outbox_events | id, aggregate_id, type, payload, status, attempts, available_at | ID là eventId cho dedup; có lịch retry |
| idempotency_records | principal_id, operation, key, request_hash, response, expires_at | unique principal/operation/key; cùng key khác payload bị từ chối |
| knowledge_documents | id, title, source_uri, version, effective_at, status | Chỉ APPROVED và còn hiệu lực được đưa vào RAG |
| cart_proposals | user_id, store_id, cart_id, cart_version, items, snapshot, added_total, cart_total, budget, nonce, confirmation_hash, expires_at, applied_at | Hiện thực migration 002; preview 2 phút, xác nhận đúng chủ, kiểm tra lại giá/tồn/version, apply một lần; chưa reserve |

## Enum thống nhất

- OrderStatus: PENDING_PAYMENT, CONFIRMED, PICKING, READY, COMPLETED, CANCELLED, EXPIRED.
- ReservationStatus: ACTIVE, COMMITTED, CONSUMED, RELEASED. ACTIVE hết hạn được RELEASED; nguyên nhân EXPIRED ghi ở đơn và ledger.
- PaymentAttemptStatus: INITIATED, PENDING, PAID, FAILED, EXPIRED. RefundStatus: REQUESTED, PROCESSING, SUCCEEDED, FAILED.
- API payment summary: UNPAID, PENDING, PAID, REFUND_PENDING, PARTIALLY_REFUNDED, REFUNDED. Summary được tính từ attempts/collections/refunds, không sửa tay.
- SlotBookingStatus: ACTIVE, RELEASED, FULFILLED. allocated_count = số ACTIVE + FULFILLED; hủy/hết hạn chỉ giảm khi booking còn ACTIVE.

## Chính sách voucher ban đầu

Một voucher/đơn, không cộng dồn. Giữ quota trong checkout, hoàn quota khi đơn hủy/hết hạn theo policy, chốt khi COMPLETED. Đơn đã trả nhưng hủy cần xử lý hoàn tiền độc lập. Dùng unique và cập nhật có điều kiện để tránh vượt quota; việc cho khách dùng lại sau hoàn toàn phần phải được chủ sản phẩm chốt.

## Dữ liệu mẫu

Seed đề xuất: 2 cửa hàng, 5 danh mục, 50 SKU, đủ vai trò giả, slot còn/hết suất, tồn 0/1/nhiều, voucher hết hạn/hết quota, đơn ở từng trạng thái và payment sandbox. SĐT/địa chỉ phải là dữ liệu giả, seed có thể chạy lặp và không được chạy nhầm production.
