# Danh mục 11 tính năng AI

AI hỗ trợ quyết định dựa trên dữ liệu được phép sử dụng. Giá, khả năng bán, quyền, hạn mức và thanh toán luôn được backend xác minh. Các mô hình dưới đây là hướng thiết kế; lựa chọn model/provider phụ thuộc thử nghiệm, chi phí và yêu cầu dữ liệu.

| ID / tính năng | Dữ liệu đầu vào | Đầu ra và cách dùng | Giai đoạn, fallback và chỉ số |
| --- | --- | --- | --- |
| AI-01 Gợi ý cá nhân hóa | Lượt xem, giỏ, mua hoàn tất, thuộc tính SKU, store, tín hiệu được phép thu | Top SKU có thể bán; lọc hết hàng và hàng không phù hợp; phối hợp content-based/collaborative khi đủ dữ liệu | Mở rộng; cold-start dùng bán chạy theo store/danh mục; đo Recall@K, NDCG@K, tỷ lệ thêm giỏ và độ đa dạng |
| AI-02 Trợ lý mua sắm | Ý định, số người, ngân sách, chế độ ăn, store, giá/tồn từ tools | Proposal có SKU, qty, tiền server tính và giả định; khách duyệt trước thêm giỏ | MVP giới hạn; fallback tìm kiếm/lọc; đo ngân sách đúng, SKU hợp lệ, tỷ lệ proposal được chấp nhận |
| AI-03 Tìm kiếm thông minh | Query tiếng Việt, không dấu/lỗi gõ; ảnh và giọng nói sau MVP | Xếp hạng SKU trong store; hybrid lexical/semantic sau baseline; ảnh chỉ gợi ý ứng viên | MVP chuẩn hóa chữ cơ bản; semantic/ảnh/voice mở rộng; đo Recall@10, nDCG, zero-result, p95 |
| AI-04 Dự báo nhu cầu/tồn | Bán theo SKU/store/ngày, stockout, lịch nhập, mùa vụ, promo | Khoảng dự báo, gợi ý nhập và mức tin cậy; quản lý duyệt | Mở rộng sau đủ chu kỳ dữ liệu; baseline trung bình theo ngày trong tuần; WAPE, bias, stockout và lượng hủy |
| AI-05 Thay thế khi hết hàng | SKU gốc, thuộc tính, giá, ràng buộc dinh dưỡng/dị ứng có chứng cứ | Danh sách thay thế, lý do và chênh tiền; không tự sửa đơn | Mở rộng, MVP chỉ gợi ý ở giỏ; fallback cùng danh mục; đo chấp nhận, phù hợp ràng buộc, phát sinh khiếu nại |
| AI-06 ETA và slot | Số dòng/số lượng, backlog, số picker, lịch sử thời điểm | Ước lượng thời gian soạn và dải sai số; backend quyết định slot theo capacity | Mở rộng; MVP cấu hình capacity/slot; đo MAE, p90 sai số, tỷ lệ trễ và calibration |
| AI-07 Tối ưu lộ trình | Vị trí kệ, sơ đồ có version, SKU; delivery có tọa độ/cửa sổ thời gian | Thứ tự lấy hàng hoặc tuyến giao đề xuất | Mở rộng; fallback thứ tự khu/kệ hoặc tuyến thủ công; đo quãng đường/thời gian, ràng buộc tải và trễ |
| AI-08 Giá/khuyến mãi động | Lô/hạn dùng, tồn, sức mua, biên lợi nhuận và policy | Đề xuất giảm giá có mức sàn, thời hạn, phạm vi; người có quyền duyệt | Mở rộng sau inventory_lots; fallback campaign cố định; đo hao hụt, margin, uplift và khiếu nại |
| AI-09 Phát hiện gian lận | Tần suất đơn/voucher, lịch sử tài khoản, tín hiệu thanh toán đã cho phép | Risk score, lý do, hàng đợi review; không tự kết luận khách gian lận | Mở rộng; MVP rate limit và rule rõ; đo precision, recall, false positive và thời gian review |
| AI-10 Chatbot CSKH | Chính sách duyệt, câu hỏi, đơn thuộc chủ phiên | Trả lời có nguồn, tra đơn qua tool, tạo ticket; hoàn tiền cần người/quy trình duyệt | MVP FAQ/tra cứu hạn chế; fallback hỗ trợ; đo groundedness, độ đúng chính sách, giải quyết và escalation |
| AI-11 Phân tích cảm xúc | Đánh giá được phép xử lý, store/SKU, thời gian | Nhãn tích cực/trung tính/tiêu cực, chủ đề, ví dụ đã ẩn danh | Mở rộng sau tính năng review; fallback phân loại thủ công; đo macro-F1, tiếng lóng/phủ định, mức hữu ích của chủ đề |

## Ví dụ AI-02

Yêu cầu: “Lên giỏ hàng cho bữa tối 4 người, ngân sách 300k”. Trợ lý cần biết store và hỏi thêm ràng buộc quan trọng chưa có như dị ứng/chế độ ăn khi cần. Nếu chưa có thông tin, trình bày giả định và tránh khẳng định món an toàn cho dị ứng. Lấy danh mục, kiểm tra tồn, lập proposal; tổng tiền không vượt 300.000đ theo giá hiện tại. Nêu rõ phí nếu chưa được tính và không hứa tổng cuối cùng khi chưa quote.

## Điều kiện phát hành

Mỗi tính năng phải có baseline không AI, nguồn dữ liệu, quyền truy cập, tập đánh giá, timeout/fallback, người chịu trách nhiệm và cơ chế tắt riêng. A/B test chỉ thực hiện khi số mẫu đủ và có guardrail tỷ lệ lỗi/chi phí/khiếu nại. Không bật một mô hình chỉ vì kết quả demo tốt.
