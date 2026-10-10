# Kịch bản bảo vệ: mobile hai vai trò, khoảng 7 phút

Cập nhật 10/10/2026 sau bổ sung SOS và sửa/xóa nhật ký. Dùng database SQL kiểm thử riêng và server cổng 5059 theo RUN_GUIDE.md. Express và SQL đều thật, dữ liệu/tài khoản giả. Không dùng database app hoặc người nhận thật cho SOS. APK debug đã build; chưa được thử trên điện thoại.

## Chuẩn bị trước buổi bảo vệ

1. Tạo fixture mới bằng `node scripts/verify_assistant_positive_api.js --fixture-only` từ `server/` để thuốc/lịch khám nằm trong ngày demo. Ghi lại tên database.
2. Khởi động server demo `--serve`, đặt MOBILE_TEST_DATABASE và nhập mật khẩu cục bộ theo RUN_GUIDE.md. Ba tài khoản giả cùng mật khẩu: test.elder.a, test.elder.b, test.caregiver.
3. Android USB: adb reverse 5059 và cài app-sql-test-debug.apk mới; Wi-Fi phải build/run với IP LAN. app-backend-debug.apk trỏ 5000/database app, không dùng cho thao tác ghi/SOS giả lập. Nếu chưa có điện thoại, dùng Flutter Web localhost:63002 trỏ localhost:5059 và nói rõ đây là bản Web.
4. Thử mở app, đăng nhập hai vai trò, kiểm tra backend còn chạy. Giữ server demo hoạt động suốt buổi; restart làm JWT cũ hết hiệu lực.
5. Mặc định chatbot theo chức năng, không gọi dịch vụ AI. Nếu trình diễn AI thật, cấu hình Groq cục bộ rồi dùng `--serve --live-ai`; chỉ dữ liệu giả lập và nói đúng nhãn thực tế. Chuẩn bị sẵn phương án theo chức năng nếu mạng/quota lỗi.
6. Không bấm nút gọi người chăm sóc: số 0000000000 là giả. Thông báo SOS trong demo là bản ghi in-app; không chứng minh SMS, FCM hay thông báo đẩy nền.

## Trình diễn

| Thời gian | Vai trò/thao tác | Điểm giải thích |
|---|---|---|
| 0:00–0:35 | Đăng nhập test.elder.a; giới thiệu trang chủ | Tài khoản liên kết hồ sơ A; thuốc, lịch khám và cảnh báo lấy API thật. |
| 0:35–1:15 | Mở thuốc hôm nay, xác nhận đã uống, quay lại | Trạng thái lưu SQL; không tạo dữ liệu trên màn hình. Tên/liều trong demo là giả lập. |
| 1:15–1:55 | Mở lịch khám, sức khỏe, người chăm sóc | Hiển thị thời gian/lịch và số đo nguồn; không chẩn đoán hoặc tự đặt ngưỡng ở mobile. |
| 1:55–2:25 | Mở thông báo TEST READ; sửa địa chỉ hồ sơ | Đánh dấu đã đọc và lưu hồ sơ; nếu lỗi mạng, báo lỗi thay vì báo thành công. |
| 2:25–3:30 | Chatbot: “Lịch khám tiếp theo?” → “Còn mấy ngày nữa?” → “Thuốc hôm nay?” | Giữ câu hỏi tiếp nối, đổi chủ đề, đối chiếu lịch/thuốc đang hiển thị. Nhãn AI hoặc theo chức năng đúng chế độ; AI không sửa dữ liệu. |
| 3:30–4:10 | Mở người chăm sóc/SOS, xác nhận gửi một lần | Ghi SOS giả lập và thông báo tới caregiver giả. Không tự gửi SOS từ chatbot; không gọi người thật. |
| 4:10–4:50 | Đăng xuất; đăng nhập test.caregiver | Đổi vai trò, không mang hồ sơ/ngữ cảnh chat cũ sang tài khoản mới. Mở thông báo SOS nếu hiển thị trên trang caregiver. |
| 4:50–5:50 | Mở A; mở Nhật ký chăm sóc, thêm ghi chú, sửa nội dung rồi xóa với xác nhận; quay lại và mở B | Nhật ký gắn A và người viết; B không có nhật ký A. Xóa mềm, SQL giữ bản ghi HUY. |
| 5:50–6:35 | Trên hồ sơ A, tiếp nhận SOS, nhập kết quả và đánh dấu đã xử lý | Cập nhật cả CanhBaoKhanCap và CanhBao trong cùng transaction; lưu người/thời điểm xử lý, cờ SOS chưa xử lý biến mất sau refresh. |
| 6:35–7:00 | Chatbot caregiver chọn A rồi B hoặc nêu kết quả kiểm thử; đăng xuất | Ngữ cảnh hồ sơ được tách. Nêu rõ phần đã kiểm tra SQL/API, widget mock và phần Android thực tế còn cần thử. |

SOS ở bước 3:30 tạo cảnh báo liên quan qua transaction hiện có. Nếu caregiver chưa thấy, tải lại hồ sơ A và kiểm tra phản hồi gửi SOS; không sửa database thủ công để tạo bằng chứng hoặc báo đã xử lý khi thao tác chưa thành công.

## Nếu gặp lỗi trong buổi trình diễn

- Không có mạng/backend: giữ lỗi và dùng Thử lại sau khi kết nối phục hồi. Không bấm gửi SOS nhiều lần khi kết quả chưa rõ; kiểm tra lịch sử/thông báo trước.
- Groq lỗi/quota: tiếp tục tra cứu theo chức năng, không đổi nhãn thành AI.
- Nhật ký không lưu: nội dung nhập được giữ; thử lại. Cảnh báo xử lý lỗi: mở lại hộp thoại trong cùng màn hình để lấy bản nháp.
- Token hết hạn: app đưa về đăng nhập; không mở dữ liệu từ tài khoản trước. Nếu backend vừa restart, đăng nhập lại.
- Chưa có điện thoại: chạy Web và ghi rõ; không gọi build APK là đã kiểm tra thiết bị thật.

## Giới hạn cần trình bày trung thực

- Nhật ký đã có tạo/đọc/sửa/xóa mềm; sửa/xóa chỉ người viết còn được phân công hoặc Admin, có kiểm tra version để tránh ghi đè.
- SOS đã có endpoint xử lý trạng thái đồng bộ với luồng cảnh báo hiện có; chỉ chuyển hợp lệ, không xử lý lại bản đã kết thúc.
- Chưa xác minh cuộc gọi, thông báo nền, USB/Wi-Fi hay bàn phím/back trên Android thật. Kiểm tra chữ lớn/màn hình nhỏ/offline đã thực hiện bằng widget test.
- Đã kiểm tra Groq thật tối thiểu bằng dữ liệu giả lập qua SDK, đạt tools và follow-up. Không chứng minh toàn bộ chatbot trên điện thoại; unit/widget test vẫn dùng mock, test ghi SQL/UI dùng trợ lý theo chức năng. Xem MOBILE_COMPLETION.md.
