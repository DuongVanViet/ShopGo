# Đăng ký, đăng nhập và ghim cửa hàng

## Luồng hiện thực

- Thanh đầu trang có nút **Đăng nhập** và **Đăng ký** riêng trên desktop/mobile. Mọi lối vào đăng nhập thông thường dẫn đến `/login` với SĐT/email và mật khẩu; OTP chỉ dùng sau khi chủ động chọn tài khoản mẫu.
- `/register`: chọn **Khách hàng** hoặc **Người bán / cửa hàng**. Không có lựa chọn nhân viên; tài khoản STAFF do MANAGER/Admin cấp.
- Khách hàng nhập họ tên, chọn SĐT **hoặc** email và mật khẩu 12–128 ký tự.
- Seller nhập tên cửa hàng, SĐT, email và mật khẩu; bấm tiếp tục để nhập địa chỉ và ghim vị trí.
- Địa chỉ gồm số nhà/đường, phường/xã, quận/huyện nếu có, tỉnh/thành phố. Không dùng danh mục đơn vị hành chính tĩnh dễ lỗi thời.
- Bước vị trí dùng Leaflet và nền OpenStreetMap trong ứng dụng; có GPS, nhấp/kéo ghim hoặc nhập latitude/longitude.
- Chưa có ghim thì không thể hoàn tất. Đổi ghim/địa chỉ bỏ xác nhận cũ; người bán phải xác nhận lại vị trí thực tế.
- Chỉ gửi đăng ký khi hoàn tất cả hai bước. Tài khoản, cửa hàng, membership MANAGER và session được tạo cùng transaction, tránh cửa hàng mồ côi.
- `/login`: dùng SĐT hoặc email cùng mật khẩu. SĐT Việt Nam dạng `090…` được chuẩn hóa thành `+8490…`, email được trim và chuyển chữ thường.
- Sau đăng ký/đăng nhập, seller/manager vào `/quan-ly`, picker vào `/soan-hang`, counter vào `/nhan-hang`, admin vào `/he-thong`; user vào trang mua sắm.
- `/seller/location`: chủ sở hữu xem/sửa địa chỉ và ghim đã lưu; kiểm tra locationVersion và chống gửi trùng khi sửa.

## Bản đồ thực và dữ liệu riêng của app

Nền bản đồ là dữ liệu địa lý thực, không phải sơ đồ cửa hàng tự vẽ. Ghim lưu latitude/longitude WGS84 trong PostgreSQL ShopGo; không tạo/sửa địa điểm trên OpenStreetMap. Request tile vẫn gửi tới nhà cung cấp theo khung nhìn; hạ tầng bản đồ chưa được tự vận hành hoàn toàn.

Phía khách hàng hiển thị địa chỉ của cửa hàng đang chọn và chỉ tải bản đồ khi khách mở **Xem vị trí**. Ghim phía khách là chỉ đọc và dùng đúng tọa độ seller đã xác nhận. Hai liên kết Google Maps dùng tọa độ làm ghim/đích đến; điểm xuất phát do Google Maps lấy từ thiết bị hoặc yêu cầu người dùng nhập. Nếu cửa hàng chưa có tọa độ, ứng dụng không suy đoán ghim từ chuỗi địa chỉ.

Ứng dụng không dùng public Nominatim/geocoding tự động. Địa chỉ nhập trong form không được gửi tới dịch vụ tra địa chỉ. Chọn điểm bằng GPS/nhấp bản đồ/tọa độ; nếu cần tìm địa chỉ tự động sau này, phải chọn nhà cung cấp hoặc dịch vụ tự vận hành phù hợp.

GPS phản ánh vị trí thiết bị tại thời điểm được cấp quyền, không chứng minh thiết bị đang ở cửa hàng. Hiển thị accuracyMeters, vòng sai số và cảnh báo khi sai số >100 m. GPS bị từ chối/lỗi không tự gán vị trí giả; bản đồ có tâm xem ban đầu nhưng không có ghim mặc định. Người bán cần đối chiếu và xác nhận trước lưu. Không cam kết độ chính xác thực địa tuyệt đối từ browser GPS hoặc dữ liệu bản đồ.

Leaflet được import phía client. Attribution OpenStreetMap hiển thị ngay trên bản đồ. Không tải hàng loạt/offline, không geocode autocomplete. Tile URL có thể cấu hình qua NEXT_PUBLIC_MAP_TILE_URL; khi đổi nguồn cần cập nhật attribution phù hợp.

Tham khảo: [Leaflet location](https://leafletjs.com/examples/mobile/), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/), [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/).

## Backend và bảo vệ tài khoản

- Migration 003 bổ sung email, password_hash, account_type; liên kết owner của store, địa chỉ JSON, tọa độ, nguồn GPS/MAP/COORDINATES, sai số và version vị trí.
- Mật khẩu dùng scrypt N=32768, r=8, p=3, salt ngẫu nhiên 16 byte; cấu hình 32 MiB theo [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Giới hạn KDF đồng thời và rate limit đăng nhập/đăng ký.
- Login lỗi trả thông báo chung; tài khoản không tồn tại vẫn chạy KDF tương đương. Không trả password_hash ra API.
- Seller chỉ có MANAGER cho cửa hàng vừa tạo, không có admin/refund hoặc quyền cửa hàng khác.
- Migration 006 bổ sung STAFF và `created_by_user_id`. MANAGER/Admin cấp tài khoản trong store; password chỉ nhận ở request, được băm trước khi lưu và không trả lại qua API.
- Public catalog không phát contactEmail, contactPhone hay ownerUserId do mở rộng schema.
- Chưa xác minh quyền sở hữu email/SĐT hoặc tư cách kinh doanh; không đánh dấu đã xác minh khi chỉ đăng ký thành công. Quên/reset mật khẩu là tính năng riêng chưa triển khai.
- Demo OTP cũ còn dùng khi backend cho phép, nhưng production vẫn cấm OTP local. Tài khoản demo chưa có mật khẩu mặc định.

## API

| Endpoint | Nội dung |
| --- | --- |
| POST /api/v1/auth/register | Payload USER/SELLER, trả session; seller kèm storeId; từ chối STAFF |
| POST /api/v1/auth/login | identifier + password, trả Bearer session |
| GET /api/v1/me | accountType, emailNormalized, membership và ownedStores của mình |
| GET /api/v1/stores/{storeId}/staff | MANAGER/Admin xem nhân sự đúng store; không trả password/hash |
| POST /api/v1/stores/{storeId}/staff | Cấp tài khoản STAFF và role theo phạm vi; cần Idempotency-Key |
| GET /api/v1/seller/store | Cửa hàng của chủ sở hữu hiện tại |
| PATCH /api/v1/seller/store/location | Địa chỉ/location/expectedVersion; cần Idempotency-Key |

## Kiểm chứng và giới hạn QA

Test PostgreSQL bao phủ email/phone normalization, mật khẩu, duplicate, quyền seller, location range/confirmation, cập nhật version và rate limit. Chrome E2E tạo user/seller, mô phỏng GPS, chọn ghim và kiểm tra dữ liệu sau đăng nhập lại. Request OSM tiles bị chặn và trả ảnh mẫu trong test để tránh tự động tải/pan bản đồ công cộng. QA xác minh UI, phép chiếu/tọa độ và lưu dữ liệu; không xác minh địa chỉ ngoài thực địa hoặc độ chính xác GPS phần cứng.
