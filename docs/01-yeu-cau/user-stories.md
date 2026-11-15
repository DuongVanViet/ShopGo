# User story và tiêu chí nghiệm thu

Các ID dùng để liên kết yêu cầu với API và kiểm thử. Given/When/Then mô tả điều kiện, hành động và kết quả có thể kiểm chứng.

| ID | User story | Tiêu chí nghiệm thu |
| --- | --- | --- |
| US-01 | Là khách, tôi muốn chọn cửa hàng gần tôi | Khi từ chối định vị vẫn tìm địa chỉ thủ công; chọn store làm mọi giá/tồn/slot đổi theo store đó |
| US-02 | Là khách, tôi muốn tìm đúng sản phẩm | Tìm từ có/không dấu trả kết quả liên quan; hết kết quả có gợi ý sửa và lọc lại; không hiển thị SKU đã ngừng bán |
| US-03 | Là khách, tôi muốn quản lý giỏ | Thêm/sửa/xóa lưu được; đổi cửa hàng hiển thị chênh giá và SKU không có; chưa xác nhận thì không thay giỏ |
| US-04 | Là khách, tôi muốn biết tổng tiền trước đặt | Server trả từng khoản và hạn quote; đổi giá/voucher/slot yêu cầu quote mới; client sửa total không đổi số tiền server |
| US-05 | Là khách, tôi muốn đặt giờ nhận | Khi tồn và slot đủ, tạo một đơn cùng reservation; hai người tranh suất cuối chỉ một người thành công |
| US-06 | Là khách, tôi muốn thanh toán an tâm | Redirect thành công chưa đủ đổi trạng thái; callback hợp lệ cập nhật một lần; callback lặp không thu/ghi nhận thêm |
| US-07 | Là khách, tôi muốn theo dõi đơn | Màn hình có trạng thái, thời gian cập nhật và slot; khi mất kết nối có thể tải lại; không dựa vào thông báo đẩy để quyết định trạng thái |
| US-08 | Là picker, tôi muốn nhận đơn cần soạn | Hai picker nhận đồng thời chỉ một thành công; đơn chưa đủ điều kiện thanh toán không vào hàng đợi soạn |
| US-09 | Là picker, tôi muốn kiểm tra hàng | Quét sai SKU bị từ chối; không đánh dấu READY khi chưa đủ các dòng; thiếu hàng tạo sự cố và thông báo quản lý |
| US-10 | Là counter, tôi muốn giao đúng đơn | QR của store khác/đã dùng/hết hạn bị từ chối; đơn trả tại quầy chỉ bàn giao sau ghi nhận tiền; quét lại trả kết quả đã nhận |
| US-11 | Là quản lý, tôi muốn kiểm soát tồn | Nhập/xuất có lý do và ledger; không chỉnh on_hand thấp hơn reserved; có cảnh báo sai lệch để xử lý đơn liên quan |
| US-12 | Là khách, tôi muốn hủy trước soạn | Đơn chưa PICKING hủy được theo policy; trả tồn/slot một lần; đơn đã trả tiền tạo nghĩa vụ hoàn và trạng thái theo dõi |
| US-13 | Là quản lý, tôi muốn báo cáo đúng tiền | Đơn hoàn tất cộng vào số đơn hoàn tất; tiền thu và tiền hoàn hiển thị riêng; báo cáo không tính tổng đơn hủy thành doanh thu |
| US-14 | Là khách, tôi muốn AI gợi ý bữa ăn | Với ngân sách 300.000đ và 4 người, AI trả SKU tồn tại, số lượng và tổng do server tính; không tự checkout hay tự thay giỏ |
| US-15 | Là khách, tôi muốn hỏi đổi trả | Câu trả lời dựa chính sách đang hiệu lực và dẫn nguồn; thiếu chính sách chuyển hỗ trợ; không hứa chắc hoàn tiền |
| US-16 | Là shipper, tôi muốn nhận và giao đơn | Sau MVP: chỉ cập nhật chuyến được giao; từ chối ghi lý do; xác nhận có bằng chứng và COD; mất mạng gửi lại không tạo bàn giao trùng |
| US-17 | Là admin, tôi muốn tách quyền giữa store | Nhân viên store A truy cập order/inventory/report store B bị từ chối, kể cả biết ID tài nguyên |
| US-18 | Là khách, tôi muốn được thông báo lỗi thanh toán | Tiền đến sau khi đơn hết hạn không làm sống lại đơn; có trạng thái cần hoàn/đối soát và hướng xử lý rõ |

## Ví dụ nghiệm thu chi tiết US-05

Given SKU còn 1 đơn vị và slot còn 1 suất; When hai checkout từ hai tài khoản gửi đồng thời; Then chỉ một giao dịch tạo reservation ACTIVE và chiếm suất, giao dịch còn lại nhận lỗi tồn/slot, không tạo thanh toán khả dụng và không để lại dữ liệu giữ chỗ rời rạc.

## Quy tắc hoàn thành story

Cần có luồng thành công, lỗi nghiệp vụ, kiểm tra quyền, lịch sử thao tác liên quan và test cho rủi ro chính. Chức năng được nghiệm thu trên môi trường thử nghiệm với dữ liệu giả; tích hợp phụ thuộc bên ngoài phải ghi rõ sandbox hay production.
