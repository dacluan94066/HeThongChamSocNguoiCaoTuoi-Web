# CareSenior — Kết quả sửa 3 lỗi ưu tiên

Ngày thực hiện: 28/10/2026. Phạm vi: tạo đơn thuốc và form nhập chỉ số Flutter; kiểm thử liên quan ở React/Backend/Flutter.

Báo cáo kiểm toán ban đầu được giữ nguyên tại [BUSINESS_LOGIC_AUDIT.md](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/reports/BUSINESS_LOGIC_AUDIT.md). Báo cáo này cập nhật riêng kết quả sửa; không coi các lỗi khác trong kiểm toán đã được xử lý.

## 1. Kết quả riêng từng yêu cầu

| Yêu cầu | Nguyên nhân đã xác minh | Thay đổi | Kết quả |
| --- | --- | --- | --- |
| 1. Thời điểm liều đầu tiên | SQL cũ đã lọc candidate quá khứ, nhưng vẫn trả 201 và lưu đơn/chi tiết khi không sinh được liều nào. Lọc dùng đồng hồ local SQL Server, thiếu chốt thời gian trước commit. UI không báo liều thực tế bắt đầu lúc nào. | Preview liều đầu theo ngày + giờ Việt Nam; chặn từng dòng thuốc không còn liều tương lai; Backend rollback toàn đơn với 422 NO_FUTURE_DOSES; kiểm tra lại trước commit, trả 409 PRESCRIPTION_TIME_CHANGED nếu giờ liều đã qua trong quá trình xử lý. | PASS — unit, Chrome fixture và SQL Stage6 rollback-only |
| 2. Huyết áp hiện nhịp tim | Form huyết áp đang bắt thêm nhịp tim và gửi hai POST độc lập BP rồi HR. HR lỗi có thể để lại BP đã lưu, retry lại BP. Không tìm thấy bằng chứng ID huyết áp bị đổi thành ID nhịp tim. | Form BP chỉ có tâm thu/tâm trương, gửi đúng một POST bằng ID loại được chọn. Nhịp tim là loại nhập riêng. Đồng nhất giới hạn BP với Backend đã có, không tự đặt ngưỡng mới. | PASS — widget thực thi UI/service bằng HTTP adapter mock, Backend handler mock |
| 3. Giá trị cũ chuyển loại/form mới | Controller dùng chung tồn tại qua các lần mở sheet; thiếu reset khi đổi loại/mở mới/lưu xong. Form cũ dùng TextField state không đổi key khi đổi loại. | Reset controller/state khi đổi loại, mở bản ghi mới và lưu thành công; dùng key theo loại cho form cũ. Giữ bản nháp khi request lỗi; khóa gửi trùng trong lúc lưu; đóng form/xóa dữ liệu và bỏ phản hồi trễ khi đổi phiên. | PASS — widget, gồm HR 85 → SpO2 và đổi tài khoản |

PASS trên là theo phương thức kiểm thử ghi rõ trong bảng. Android Emulator/thiết bị thật: **NOT_RUN**; adb devices không có thiết bị. Không khẳng định đã kiểm chứng thao tác Android native.

## 2. Quy tắc tạo lịch thuốc sau sửa

- Mốc thời gian là giờ Việt Nam, so sánh cả ngày lẫn giờ.
- Giữ chính sách hiện có: bỏ các cữ đã qua hôm nay; các cữ tương lai còn lại vẫn được tạo.
- Ví dụ đang 15:00:
  - Chỉ hôm nay, 08:00 → từ chối; không lưu đơn rỗng.
  - Hôm nay 08:00 và 20:00 → chỉ tạo 20:00, UI nói rõ bỏ cữ đã qua.
  - Hôm nay đến ngày mai, 08:00 → liều đầu ngày mai 08:00.
  - Bắt đầu ngày mai 08:00 → hợp lệ.
- Không chọn ngày kết thúc vẫn theo chính sách sinh lịch 30 ngày hiện có.
- Mỗi thuốc trong đơn phải còn ít nhất một liều tương lai; một thuốc không đạt thì rollback toàn bộ đơn.
- 23:59/00:00 và giờ vừa qua trong lúc xử lý được kiểm tra bằng đồng hồ cố định trong test; không sửa dữ liệu lịch sử.
- Không đổi /confirm, /medication-schedules/:id/status, ghi nhận muộn hoặc bổ sung ngày cũ.
- Backend dùng giờ UTC hệ thống SQL chuyển sang wall time Việt Nam đang lưu trong datetime2. Frontend không trừ 7 giờ để chữa hiển thị và không quyết định quyền ghi.

## 3. Truy vết chỉ số

Đã kiểm tra danh mục loại → lựa chọn trên Flutter → trường nhập → payload của HealthMetricService → Backend tra LoaiChiSoSucKhoe theo ID → validation/binding giá trị → dữ liệu đọc lại/lịch sử/biểu đồ qua test hiện có.

Test widget đảo thứ tự danh mục và dùng ID không liên tiếp:

| Loại | ID fixture | Trường nhập/đơn vị |
| --- | --- | --- |
| Huyết áp | 701 | Tâm thu + tâm trương, mmHg |
| Nhịp tim | 17 | Một giá trị, nhịp/phút |
| Đường huyết | 206 | Một giá trị, mg/dL |
| Nhiệt độ cơ thể | 42 | Một giá trị, °C |
| SpO2 | 518 | Một giá trị, % |
| Cân nặng | 90 | Một giá trị, kg |

Đây chỉ là ID trong test; không đổi ID của database. Backend handler test dùng một bộ ID không liên tiếp khác, kiểm tra input SQL và từ chối payload nhịp tim có trường tâm trương. Không sửa model/service/catalog/schema.

Form huyết áp không còn tạo bản ghi nhịp tim tự động. Người dùng chọn Nhịp tim riêng nếu cần ghi chỉ số đó.

## 4. File chỉnh sửa/tạo

### Code ứng dụng (5 file)

1. [donThuoc.controller.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/donThuoc.controller.js): đồng hồ Việt Nam, zero-dose rollback, kiểm tra trước commit.
2. [medicationScheduleRules.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/src/utils/medicationScheduleRules.js): hàm preview liều đầu.
3. [MedicationSchedulePage.jsx](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/src/pages/MedicationSchedule/MedicationSchedulePage.jsx): hiển thị preview và lỗi từng dòng, chặn submit không hợp lệ.
4. [health_detail_screen.dart](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/health/health_detail_screen.dart): BP hai trường/một request, reset/session guard.
5. [health_screen.dart](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/health/health_screen.dart): reset giá trị hiển thị và payload khi đổi loại ở form cũ; chống dữ liệu phiên cũ.

### Test (8 file)

- Tạo [prescription-time.test.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/test/prescription-time.test.js).
- Tạo [prescription-time-stage6.integration.test.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/test/prescription-time-stage6.integration.test.js).
- Sửa [health-metric-time.test.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/test/health-metric-time.test.js).
- Tạo [prescriptionTime.test.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/test/prescriptionTime.test.js).
- Sửa [medicationManagement.browser.test.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/test/medicationManagement.browser.test.js).
- Sửa [medicationManagementPreview.jsx](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/test/fixtures/medicationManagementPreview.jsx).
- Sửa [health_dashboard_ui_test.dart](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/test/health_dashboard_ui_test.dart).
- Tạo [health_measurement_form_test.dart](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/test/health_measurement_form_test.dart).

Báo cáo mới: reports/PRIORITY_3_FIXES.md. Tổng 14 file của đợt này (9 file đã theo dõi được sửa, 4 test mới, 1 báo cáo mới). mobile/design_reference/ và các báo cáo cũ giữ nguyên.

## 5. Kết quả kiểm thử

| Nhóm | Kết quả | Phương thức / giới hạn |
| --- | --- | --- |
| Toàn bộ Backend: node --test test/*.test.js | **483 PASS, 0 FAIL, 3 SKIP / 486** | SQL opt-in tắt trong suite thường; gồm test tạo DB Người thân không được bật. Test SQL đơn thuốc chạy riêng bên dưới. |
| Toàn bộ Frontend mới nhất: node --test test/*.test.js | **359 PASS, 0 FAIL, 0 SKIP** | Gồm Chrome headless thực thi Web với fixture HTTP/Socket.IO localhost, không dùng API/database chính. |
| Flutter: flutter test --no-pub | **496 PASS, 0 FAIL** | Widget/unit fixture; không phải emulator. |
| Flutter: flutter analyze --no-pub | **PASS, No issues found** | Đã sửa các cảnh báo sinh ra trong file thuộc đợt này và chạy lại. |
| npm run build | **PASS** | Có cảnh báo bundle trên 500kB; không phải lỗi build. |
| npm run lint | **PASS (exit 0)** | 10 warning có sẵn ở StatusTag, AccountMenuModals, SmartAlertCenter, AuthContext; các file này không sửa. |
| git diff --check và kiểm tra whitespace các file mới | **PASS** | Kèm đối chiếu SHA256 với snapshot đầu đợt. |
| Android Emulator/điện thoại thật | **NOT_RUN** | adb devices -l không có thiết bị. |
| Ghi chỉ số sức khỏe qua SQL thật | **NOT_RUN** | Dùng handler/mock và widget adapter; không ghi chỉ số vào dữ liệu thật. |


Kiểm thử riêng:
- Backend thời gian đơn thuốc + chọn thuốc/bộ lọc cũ: 15 PASS.
- Frontend preview thời gian: 4 PASS.
- Backend loại chỉ số/timezone: 18 PASS.
- Widget ID/loại/đơn vị đảo danh mục: 6 PASS.
- Widget reset/bản nháp lỗi/đổi phiên: 5 PASS.
- Chrome quản lý thuốc mới nhất: 13 PASS (12 tình huống + test cha), 360/768/1024/1440px. Gồm hai tình huống tạo đơn mới và hồi quy 409, readonly, realtime chi tiết, 180% chữ.
- SQL Stage6 tạo đơn: 5 PASS (4 tình huống + test cha).

Các nhóm test riêng có phần trùng với suite đầy đủ; không cộng chúng thành tổng ca độc lập.

Bằng chứng/log: C:/Users/Admin/AppData/Local/Temp/caresenior-priority-fixes-a80c22f853854136bc53b8f1d8b7d997.
Chrome fixture gần nhất có ảnh và JSON kết quả tại thư mục evidence được in trong medication-browser.log; các ảnh chụp cuối tình huống có thể là trang sau khi đã đóng form.

## 6. Kiểm soát dữ liệu và Git

- Git trước sửa: chỉ có mobile/design_reference/ và reports/ chưa được theo dõi; không có tracked diff.
- Đối chiếu SHA256 với snapshot đầu đợt: chỉ 9 file tracked trong danh sách trên thay đổi; không có file cũ bị xóa. Nội dung thiết kế tham khảo và báo cáo kiểm toán cũ giữ nguyên.
- Không commit/push/reset/clean.
- Không sửa SOS, authentication, services/models, realtime, schema; không chạy patch/FINAL/seed.
- Suite Node thông thường chạy với preload chặn mạng ngoài và cổng database/server thật; Chrome dùng HTTP/Socket.IO fixture localhost riêng, API trong RAM.
- SQL tích hợp chỉ kết nối DESKTOP-4FJVTFU\\SQLEXPRESS, database CareSeniorRelativesTest_Stage6_20261027. Guard xác minh instance và DB_NAME trước các batch, tổng 39 lần xác minh.
- SQL thực thi controller và constraints trong transaction kiểm thử thực; wrapper rollback tại ranh giới commit. Số dòng DonThuoc, DonThuocChiTiet, LichUongThuoc trước/sau bằng nhau; không lưu dòng test. SQL identity có thể tăng do cấp ID rồi rollback.
- Không tạo/xóa database, không ghi vào database chính hoặc bốn fixture cũ; không phát realtime/thông báo ra dịch vụ thật, không gửi SOS.
- Không sử dụng checksum để khẳng định database chính đang hoạt động không có thay đổi từ worker khác. Xác nhận ở đây là các thao tác đợt này không ghi vào database chính.

## 7. Giới hạn và kiểm tra thủ công

- Android native: NOT_RUN vì không có thiết bị adb. Widget test không thay thế kiểm tra bàn phím/IME/lifecycle Android.
- Không kiểm thử lưu chỉ số vào tài khoản thật. Health API dùng handler + SQL mock và widget HTTP adapter; chỉ tạo đơn thuốc được chạy SQL thật với rollback.
- Không kiểm chứng lại Google/AI provider thật, loa vật lý hoặc SOS thật trong đợt này. Hồi quy tự động dùng fixture; các module đó không bị sửa.
- Không tự xử lý các lỗi khác trong báo cáo kiểm toán, đặc biệt AUD-01 về thu hồi quyền socket và AUD-07/AUD-09/AUD-10. Vì vậy kết quả này không phải tuyên bố toàn hệ thống đã sẵn sàng production.

Checklist Android khi emulator sẵn sàng:
1. Mở Huyết áp: chỉ thấy Tâm thu/Tâm trương; Nhịp tim có màn nhập riêng.
2. Nhập Nhịp tim 85, đóng form, chọn SpO2: form mới trống.
3. Mở lại cùng loại: form mới trống; kiểm tra bàn phím và cuộn.
4. Dùng cấu hình Stage6 nếu cần bấm Lưu: success reset; lỗi giữ draft, không tự retry; không dùng tài khoản thật để ghi thử.

Kết luận: ba yêu cầu đã được khắc phục và PASS trong phạm vi tự động/SQL cách ly nêu trên; nghiệm thu thiết bị Android trực tiếp còn NOT_RUN. Các phát hiện ngoài phạm vi tiếp tục theo báo cáo kiểm toán, chưa tự sửa.
