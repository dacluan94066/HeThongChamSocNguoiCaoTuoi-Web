# Các luồng Flutter và cách kiểm tra

Thay đổi chỉ nằm trong Mobile; backend, Web và database không đổi.

## Luồng đã nối API

- Đăng ký hai vai trò qua `POST /auth/register` (giữ nguyên).
- Đăng nhập qua `POST /auth/login`, gửi `platform: mobile`; khôi phục phiên qua `GET /auth/me`.
- Người cao tuổi vào `/home`, người chăm sóc vào `/caregiver-home`. Tài khoản chưa có hồ sơ vẫn đăng nhập được; trang chủ hiển thị lỗi, hướng dẫn liên hệ Admin, nút thử lại, thông tin tài khoản và đăng xuất. Mobile không tự tạo thêm hồ sơ.
- Hồ sơ người cao tuổi: `GET/PUT /elderly/me`. Hồ sơ tài khoản và đổi mật khẩu dùng API auth hiện có.
- Người chăm sóc xem người được phân công qua `GET /caregivers/me/elderly`, xem hồ sơ qua `GET /elderly/:id`.
- SOS: `POST /emergency-alerts`. Thông báo kết quả dựa vào `soNguoiChamSocDaThongBao`; lưu SOS không có nghĩa người chăm sóc đã đọc hoặc nhận push.
- Thông báo: `GET /notifications/me`, `PATCH /notifications/:id/read`. Bấm thông báo mở nội dung, kể cả thông báo đã đọc. Người chăm sóc mở hồ sơ liên quan từ cảnh báo bằng các API có kiểm tra phạm vi, sau đó xác nhận hồ sơ vẫn nằm trong danh sách đang được phân công.
- Cảnh báo người chăm sóc: `GET /elderly/:id/alerts`, `PATCH /alerts/:id/seen`, `PATCH /alerts/:id/resolve`. Cảnh báo đã xử lý không giữ banner SOS đang mở.
- Lịch khám người cao tuổi: `GET /elderly/me/appointments`, `/elderly/me/appointments/upcoming`.
- Trong hồ sơ người được chăm sóc, nút lịch khám trên thanh tiêu đề mở toàn bộ lịch qua `GET /appointments?nguoiCaoTuoiId=:id`; chuẩn hóa response Web sang dữ liệu màn hình Mobile. Backend kiểm tra quyền xem lịch khám và phạm vi phân công. Mobile chỉ đọc lịch; backend hiện chặn Mobile tạo/sửa lịch.

Trang chủ, thông báo và lịch khám cập nhật mỗi 30 giây khi route đang hiển thị và app ở foreground; khi quay lại app cũng cập nhật. Chi tiết người được chăm sóc cập nhật cảnh báo. Dừng timer khi rời màn hình. Kéo xuống vẫn tải mới thủ công.

Request thuộc phiên cũ không được trả dữ liệu thành công cho phiên mới. Lỗi 401 từ phiên cũ không xóa token phiên mới.

## Cấu hình và chạy

Mặc định `API_BASE_URL=http://10.0.2.2:5000/api`, dành cho Android Emulator chuẩn. Điện thoại thật cần IP LAN của máy chạy backend và cùng mạng:

```sh
flutter run --dart-define=API_BASE_URL=http://<IP-LAN>:5000/api
flutter analyze --no-pub
flutter test --no-pub
flutter build apk --debug --no-pub
```

Không đưa JWT hoặc mật khẩu thật vào test. `test/mobile_flows_test.dart` dùng HTTP adapter, secure storage và notification plugin giả lập; không ghi database thật.

Trên máy Windows hiện tại, Java làm sai đường dẫn project có dấu tiếng Việt khi chạy Gradle. Có thể dùng ổ đĩa tạm bằng `subst` trỏ vào thư mục project, chạy Flutter từ đường dẫn không dấu rồi gỡ ổ tạm. Không cần di chuyển hay xóa project.

Kết quả kiểm tra: `flutter analyze` sạch và 17/17 test pass. Chưa build được APK mới: đường dẫn tạm giúp chạy wrapper, nhưng Gradle tiếp tục lỗi `:app:compileFlutterBuildDebug` với `Cannot invoke "java.io.File.exists()" because "parent" is null`. Lần lấy stacktrace tiếp theo bị treo và đã dừng; ổ đĩa tạm đã được gỡ. Chạy Gradle trực tiếp bằng Java mặc định của máy cũng gặp Java 11, trong khi Android Gradle plugin yêu cầu Java 17 trở lên. Chưa thay đổi cấu hình Java toàn hệ thống hoặc nâng cấp dependency để xử lý các lỗi môi trường này.

## Phần còn phụ thuộc backend / thiết bị

- Push khi app đóng hoặc chạy nền: chưa có đăng ký device token và dịch vụ push từ backend. Polling foreground không đảm bảo nhận SOS khi app đóng.
- Google login, quên mật khẩu/OTP: backend chưa có API tương ứng; giao diện hiện thông báo chưa hỗ trợ, không giả lập thành công.
- SOS chỉ tạo thông báo cho người chăm sóc đã có tài khoản và được phân công. Mobile không liên kết tài khoản hoặc tự phân công.
- Quyền truy cập và khóa tài khoản vẫn do backend quyết định; Mobile không thay đổi policy/JWT của backend.
- Cần kiểm tra trên thiết bị thật: mạng LAN, quay số, quyền thông báo, nhắc thuốc và hai tài khoản được phân công thực tế. Test giả lập không xác nhận các khả năng này.
