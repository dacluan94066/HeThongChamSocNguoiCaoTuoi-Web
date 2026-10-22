# Ghi nhận bổ sung liều đã uống

## Cài đặt

Với database đang dùng, chọn đúng database CareSenior trong SQL Server Management Studio rồi chạy **chỉ** `patch_medication_supplement.sql`. File này idempotent, chỉ tạo bảng/index lưu lịch sử, không cập nhật liều thuốc hay hồ sơ hiện tại. Không chạy lại toàn bộ FINAL.sql lên database có dữ liệu: script FINAL dành cho cài đặt mới.

Đã đồng bộ cấu trúc bảng vào `QLSucKhoeNguoiCaoTuoi_FINAL.sql` cho lần cài đặt mới. Không có migration tự chạy khi server khởi động. Khi chưa cài bảng, đọc lịch/báo cáo và xác nhận hôm nay vẫn hoạt động; API bổ sung trả 503 `SUPPLEMENT_NOT_INSTALLED` và không sửa dữ liệu.

## Quy tắc

- Dùng cho liều **đã thực sự uống nhưng quên ghi nhận**, không phải khuyến nghị uống bù.
- Liều phải thuộc ngày trước theo giờ Việt Nam, trong **48 giờ tính từ giờ dự kiến**, ở trạng thái `BoLo` hoặc `ChuaDenGio`. Không mở lại `TuChoi` hoặc sửa `DaUong`.
- Giờ đã uống phải có timezone UTC (`Z`) hoặc Việt Nam (`+07:00`), không ở tương lai và không trước ngày của liều thuốc. Lý do 5–300 ký tự.
- Mọi vai trò đều áp dụng giới hạn 48 giờ; chưa có chức năng sửa lịch sử xa hơn cho Admin.
- API mới: `PATCH /api/medication-schedule/:id/supplement`, body `{ thoiGianThucTe, lyDo }`. Không thay đổi hợp đồng API xác nhận hôm nay.
- Quyền `QLLICHUONGTHUOC/sua` vẫn bắt buộc. Backend kiểm tra NCT sở hữu hồ sơ hoặc người chăm sóc đang được phân công; Admin có quyền quản lý. Không tin NCT ID hay người xác nhận do client gửi.
- Transaction SERIALIZABLE, khóa liều UPDLOCK/HOLDLOCK và unique index ngăn hai thiết bị ghi trùng. Lỗi ghi audit phải rollback trạng thái.
- Lưu trạng thái/giờ uống/người xác nhận cũ, trạng thái mới, giờ thực sự uống, giờ ghi nhận, người ghi, vai trò và lý do. Không sửa `GhiChu` cũ. Bảng không có API xóa/sửa; giữ snapshot khi hồ sơ tài khoản/đơn thuốc bị xóa.
- Chỉ dọn nhắc liều đã ghi nhận; không tạo liều, không gửi SOS, không tái bật nhắc thuốc. Cảnh báo bỏ lỡ cũ vẫn được giữ làm lịch sử, không tự đánh dấu đã xử lý.
- Mobile/Web hiển thị dấu “Ghi nhận bổ sung”, hai mốc thời gian, người ghi và lý do từ API. Thay đổi realtime và cache theo cơ chế hiện có.
- Báo cáo vẫn tính theo ngày **dự kiến** của liều và chỉ đếm mỗi liều một lần. Tách số liều không sau/sau giờ dự kiến/chưa rõ giờ, cùng số ghi nhận bổ sung (có thể giao với các nhóm giờ uống). Không gọi đây là đánh giá y khoa về uống đúng giờ. Dữ liệu xác nhận thông thường cũ vẫn có `ThoiGianThucTe` là thời điểm bấm xác nhận; không suy diễn lại giờ uống thực tế của dữ liệu đó.

## Kiểm thử an toàn

Backend dùng `node --test test/*.test.js`, frontend dùng `node --test test/*.test.js`, `npm run build`, `npm run lint`, Mobile dùng `flutter analyze` và `flutter test`. Test bổ sung sử dụng mock DB/HTTP, gồm trùng yêu cầu, scope quyền, hạn 48 giờ, timeout/kết nối, realtime, cache, hủy form và responsive.

Chưa chạy SQL patch hay xác nhận thuốc trên tài khoản thật trong lượt triển khai ban đầu. Sau đó đã chạy riêng patch trên CSDL local theo yêu cầu người dùng ngày 23/10/2026, xác minh bảng/index và dữ liệu liều thuốc trước/sau không đổi. Không xác nhận thuốc thật để kiểm thử. Kiểm thử SQL Server end-to-end cần database thử nghiệm riêng; không lấy kết quả mock thay cho kiểm thử database thực tế.

### Kết quả đã chạy ngày 23/10/2026

| Kiểm tra | Kết quả |
| --- | --- |
| `flutter analyze` | PASS, không có issue |
| Toàn bộ `flutter test` | PASS 485/485 (465 test trước + 20 test mới) |
| Backend `node --test test/*.test.js` | PASS 281/281; DB giả lập, không ghi DB thật |
| Frontend `node --test test/*.test.js` | PASS 8/8 |
| Frontend `npm run build` | PASS; còn cảnh báo bundle >500KB |
| Frontend `npm run lint` | PASS exit 0; 12 warning cũ ở file ngoài tính năng, không có error |
| Android Emulator `emulator-5554` | PASS luồng form/hủy/xác nhận, metadata, tiến độ, dọn nhắc và chữ 1,8× trong app preview riêng, API giả |
| Responsive 320/390/768dp, chữ 1,0 và 1,8× | PASS widget test, gồm viewInsets bàn phím giả lập |
| Gboard dock/nổi trên mọi cấu hình | NOT_RUN riêng cho tính năng này, không suy ra từ viewInsets giả lập |
| Chạy riêng SQL patch trên CSDL local theo yêu cầu người dùng | PASS, bảng/index được xác minh, liều thuốc cũ không đổi |
| Backend end-to-end ghi nhận bổ sung trên SQL Server thật | NOT_RUN; cần database test riêng |
| Kiểm thử tương tác Web trong trình duyệt | NOT_RUN; đã chạy build, lint và test tiện ích |
| `git diff --check` | PASS |

Android chạy bằng project preview `C:/Users/Admin/Documents/ChatGPT/KLCN/home_ui_native_preview`, application ID riêng `com.doantotnghiep.caresenior.home_ui_preview`, không thay ứng dụng/tài khoản thật. Fixture native ở `integration_test/medication_supplement_native_test.dart` trong project preview, ảnh bằng chứng `medication_supplement_android_{form,filled,recorded,large_text}.png` trong thư mục KLCN.

### File thay đổi trong lượt này

Không tính các thay đổi UI/điều hướng đã có trước khi bắt đầu:

- `mobile/lib/screens/medication/medication_screen.dart`
- `mobile/lib/screens/medication/medication_dashboard_ui.dart`
- `mobile/lib/screens/medication/medication_supplement_dialog.dart` (mới)
- `mobile/lib/services/medication_schedule_service.dart`
- `mobile/test/medication_supplement_test.dart` (mới)
- `server/src/controllers/medicationSupplement.controller.js` (mới)
- `server/src/controllers/lichUongThuoc.controller.js`
- `server/src/controllers/report.controller.js`
- `server/src/routes/medicationSchedule.routes.js`
- `server/src/utils/medicationSupplement.js` (mới)
- `server/test/medication-supplement.test.js` (mới)
- `server/test/medication-missed.test.js` (sửa assertion cũ để nhận clock `displayNow` đã tồn tại trong trang Web trước lượt này)
- `server/database/patch_medication_supplement.sql` (mới)
- `server/database/README_medication_supplement.md` (mới)
- `QLSucKhoeNguoiCaoTuoi_FINAL.sql` (chỉ thêm cùng định nghĩa bảng audit cho cài đặt mới)
- `frontend/src/pages/MedicationSchedule/MedicationSchedulePage.jsx`
- `frontend/src/pages/Reports/ReportsPage.jsx`
- `frontend/src/services/scheduleService.js`
- `frontend/src/utils/medicationSupplement.js` (mới)
- `frontend/test/medicationSupplement.test.js` (mới)

Không thay đổi Home, Sức khỏe, Floating Pill, container Lịch trình, authentication, SOS, chatbot hoặc worker nhắc thuốc trong lượt này. Đã đối chiếu SHA-256 với baseline trước khi sửa để xác nhận các thay đổi có sẵn được giữ nguyên. Không commit, push, reset, clean hoặc chạy lệnh thay đổi dữ liệu SQL Server.
