# Tầm nhìn và phạm vi

## Bài toán

Khách hàng mất thời gian tìm sản phẩm và chờ thanh toán. Cửa hàng thiếu kết nối giữa đơn trực tuyến, tồn kho và nhân viên soạn hàng. Việc giao tận nơi dễ tách khỏi quy trình tại chi nhánh, dẫn đến sai tồn, hứa giờ nhận không phù hợp và khó đối soát.

ShopGo tổ chức một vòng đời đơn thống nhất từ chọn cửa hàng đến nhận hàng. AI hỗ trợ tìm kiếm, lập giỏ và quyết định vận hành, còn backend kiểm soát giá, tồn kho, thanh toán và quyền truy cập.

## Giá trị và cách đo

| Đối tượng | Kết quả mong muốn | Chỉ số theo dõi |
| --- | --- | --- |
| Khách hàng | Đặt hàng nhanh, biết chính xác lúc nào đến lấy | Thời gian hoàn tất checkout, tỷ lệ đơn nhận đúng slot, tỷ lệ bỏ giỏ |
| Cửa hàng | Giảm thao tác thủ công và sai hàng | Thời gian soạn/đơn, tỷ lệ thiếu hàng khi soạn, độ chính xác tồn |
| Quản lý | Nhìn thấy doanh thu và năng lực phục vụ | Doanh thu theo cửa hàng, số đơn mỗi slot, tỷ lệ hủy/hoàn |
| Nền tảng | Cải thiện chất lượng dịch vụ theo dữ liệu | Tỷ lệ mua lại, mức hài lòng, chi phí AI/đơn thành công |

Chưa đặt mục tiêu tăng doanh thu theo phần trăm khi chưa có baseline. Thu thập số liệu pilot trước khi cam kết KPI kinh doanh.

## Phạm vi MVP

1. Web responsive; chọn cửa hàng, duyệt danh mục, tìm kiếm chữ, xem giá và tồn khả dụng.
2. Tài khoản khách bằng SĐT/OTP; tài khoản nhân sự được cấp theo vai trò và cửa hàng.
3. Giỏ hàng thuộc một cửa hàng; checkout chọn slot nhận hàng, áp voucher cơ bản.
4. Click & Collect: giữ tồn có hạn, nhận đơn, phân picker, soạn, sẵn sàng, quét QR bàn giao.
5. Thanh toán khi nhận và một cổng thanh toán trực tuyến được chọn sau. Tích hợp sandbox trước production.
6. Quản lý sản phẩm, giá theo cửa hàng, nhập/xuất/điều chỉnh tồn có lịch sử.
7. Dashboard đơn và doanh thu cơ bản; thông báo trong ứng dụng và một kênh ngoài ứng dụng được chốt trước pilot.
8. Trợ lý đề xuất giỏ từ danh mục thật và FAQ dựa trên tài liệu đã duyệt; khách xác nhận trước khi thay đổi giỏ.

## Mở rộng sau MVP

- Giao tận nơi, ứng dụng shipper, gom tuyến, bằng chứng giao hàng, thu và đối soát COD.
- Google/Apple, giọng nói, hình ảnh, danh sách mua định kỳ, điểm thưởng và đánh giá.
- Nhiều ví điện tử/thẻ; hoàn tiền tự động theo từng cổng.
- Cá nhân hóa bằng mô hình, dự báo nhu cầu, tối ưu đường soạn, ETA học từ dữ liệu.
- Khuyến mãi động, phát hiện gian lận, phân tích cảm xúc và quản trị marketplace.

Mô hình dữ liệu dự phòng cho delivery nhưng không xem sự hiện diện của bảng/enum là hoàn thành tính năng.

## Giới hạn nghiệp vụ ban đầu

- Một đơn thuộc một cửa hàng, một phương thức nhận và một loại tiền VND.
- MVP chỉ bán SKU đếm được bằng đơn vị nguyên. Hàng cân ký, đổi giá theo trọng lượng và hàng có điều kiện bán cần đặc tả riêng.
- Không thay sản phẩm hoặc tăng tiền đơn nếu chưa có xác nhận của khách. MVP ưu tiên hủy và hoàn theo quy trình nếu không đủ hàng.
- Không chia đơn giữa nhiều chi nhánh; đổi cửa hàng yêu cầu tính lại giỏ và xác nhận.
- Tồn hiển thị chỉ mang tính thời điểm; khả năng đặt được xác nhận khi giao dịch giữ tồn thành công.

## Điều kiện nghiệm thu pilot

Một cửa hàng thử nghiệm hoàn tất được luồng đặt → thanh toán/ghi nhận trả khi nhận → soạn → quét QR → bàn giao; không bán vượt tồn trong thử nghiệm đồng thời; không bàn giao trùng; sự kiện thanh toán có thể đối soát. Quản lý xử lý được thiếu hàng, thanh toán đến muộn và khách không đến nhận theo runbook.
