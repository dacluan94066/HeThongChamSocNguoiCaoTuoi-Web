# CareSenior — Đợt 2: sáu lỗi MEDIUM

Ngày thực hiện: 28/10/2026. Phạm vi: AUD-08, AUD-11, AUD-12, AUD-13, AUD-14, AUD-15.

## 1. Kết luận và ma trận 15 phát hiện

**READY WITH LIMITATIONS cho demo cách ly có kiểm soát.** Không tuyên bố production hoặc toàn bộ Android đã được nghiệm thu. Backend chính cổng **5000 vẫn DỪNG**, không tự khởi động lại.

Báo cáo audit, PRIORITY_3_FIXES và báo cáo HIGH được giữ nguyên làm hồ sơ lịch sử. Trạng thái mới nhất:

| ID | Mức độ gốc | Trước Đợt 2 | Sau Đợt 2 | Bằng chứng |
| --- | --- | --- | --- | --- |
| AUD-01 | CRITICAL | FIXED | FIXED | SQL Stage6 + Socket.IO: khóa tài khoản/JWT hết hạn chặn private event. Không sửa socket.js. |
| AUD-02 | MEDIUM | FIXED | FIXED | Huyết áp vẫn hai giá trị, không bắt HR; catalog ID/đơn vị được giữ. Full Flutter PASS. |
| AUD-03 | HIGH | FIXED | FIXED | Không mở lại luồng hai POST BP/HR và retry lưu BP trùng. |
| AUD-04 | HIGH | FIXED | FIXED | Reset khi đổi loại/form mới/lưu thành công; lỗi giữ draft và session guard vẫn PASS. |
| AUD-05 | MEDIUM | FIXED | FIXED | Không sửa clinical validation hoặc giới hạn đo đã được duyệt. |
| AUD-06 | MEDIUM | FIXED | FIXED | Chạy lại SQL thật: past-only422, rollback đơn/chi tiết/liều; ngày mai và lịch lặp tạo đúng. |
| AUD-07 | HIGH | FIXED | FIXED | Không sửa CAS. Chrome Admin/CG vẫn xử lý409, tải lại, không retry ghi. |
| AUD-08 | MEDIUM | OPEN | **FIXED** | Node + SQL guard + Chrome form + SQL thật rollback. |
| AUD-09 | HIGH | PARTIALLY_FIXED | **PARTIALLY_FIXED** | Regression GPS PASS; native emulator GPS mới accuracy5m PASS. Chưa đủ permission/cache/thiết bị thật. |
| AUD-10 | HIGH | PARTIALLY_FIXED | **PARTIALLY_FIXED** | Native HOME/resume và nhả sớm0POST. Khóa màn/cuộc gọi/shade thực tế còn NOT_RUN. |
| AUD-11 | MEDIUM | OPEN | **FIXED** | SQL: hồ sơ đặc biệt nhận nhắc; chống trùng; ngừng theo dõi không nhận. |
| AUD-12 | MEDIUM | OPEN | **FIXED** | Theo phê duyệt giữ riêng thông tin hồ sơ/account; Web/Mobile ghi nhãn đúng; onboarding không ghi đè tài khoản. |
| AUD-13 | MEDIUM | OPEN | **FIXED** | Chưa có ngưỡng hiển thị trung tính; không sửa số đo/cờ bất thường. SQL, Web, Flutter. |
| AUD-14 | MEDIUM | OPEN | **FIXED** | Event dùng giờ tạo alert trong SQL; giữ giờ đo riêng; SQL backdated measurement/SLA PASS. |
| AUD-15 | MEDIUM | OPEN | **FIXED** | Hai handler update chặn trùng409; transaction/applock phối hợp writer; SQL cạnh tranh độc lập PASS. |

Tổng: **13 FIXED, 2 PARTIALLY_FIXED, 0 MEDIUM OPEN, 0 BLOCKED**. Không gộp các rủi ro R-01…R-12 thành bug đã sửa. Chưa tự giải quyết các chính sách ngoài15ID.

## 2. AUD-08 — Tạo lịch khám vào giờ đã qua hôm nay

- **Nguyên nhân:** create chỉ kiểm ngày, nên 15:00 vẫn nhận08:00 cùng ngày. Regression mới đỏ trước sửa; nhóm thời gian/predicate nhắc khám có3 FAIL trên bản cũ.
- **Sửa tối thiểu:** xét ngày+giờ ở offset Việt Nam `+07:00`. Đặt mới phải ở tương lai. SQL `INSERT ... SELECT ... WHERE @thoiGian > DATEADD(HOUR,7,SYSUTCDATETIME())` kiểm lại tại lúc ghi; hết hạn giữa Node và SQL trả422 `PAST_APPOINTMENT_TIME`, không emit thành công.
- **Web:** chặn trước request khi tạo hoặc đổi ngày giờ, báo lỗi tại ô giờ. Giữ sửa thông tin lịch sử khi thời gian không đổi theo nghiệp vụ cũ.
- **Regression:** clock cố định15:00:08:00/exact15:00 từ chối,15:01 nhận, ngày mai08:00 nhận, sát00:00 và ngày sai. SQL thật tạo ngày mai08:00 đúng wall clock rồi rollback. Chrome dùng picker/form thật: giờ quá khứ không phát request ghi, mở lại form vẫn chạy ca409 cũ đúng.
- **Ảnh hưởng:** không đổi CAS/phân quyền, không thêm quyền ghi cho NCT/Người thân.

## 3. AUD-11 — Hồ sơ chăm sóc đặc biệt mất nhắc khám

- **Nguyên nhân:** whitelist chỉ `DangTheoDoi`, khác phạm vi hồ sơ còn chăm sóc của luồng thuốc. Test predicate mới FAIL trên bản cũ.
- **Sửa:** chỉ mở whitelist thành `DangTheoDoi`, `CanChamSocDacBiet`. Giữ `ChuaDen`, lịch tương lai, mốc24h/2h, materializer lock và idempotency.
- **SQL thật:** outer transaction đổi hồ sơ giả sang trạng thái đặc biệt và tạo lịch8h tới → đúng một nhắc; gọi lần hai0nhắc; `NgungTheoDoi` không nhận nhắc mới. Rollback toàn bộ. Không chạy worker hoặc emit notification thật.

## 4. AUD-12 — Tách thông tin hồ sơ và tài khoản

- **Quyết định đã được người dùng duyệt:** giữ riêng phone/name hồ sơ với tài khoản. Không tự đổi định danh đăng nhập, GoogleSubject, JWT hoặc vai trò.
- **Trước:** nhãn chung gây hiểu nhầm. Luồng hoàn thiện hồ sơ còn UPDATE `NguoiDung.HoTen/SoDienThoai`, dù luồng sửa hồ sơ thường không làm vậy. Regression tạo hồ sơ với phone khác account FAIL vì phát hiện UPDATE account.
- **Sau:** hồ sơ/form ghi “Họ tên hồ sơ NCT”, “Số điện thoại liên hệ”; thông tin tài khoản ghi “Tên tài khoản”, “Số điện thoại tài khoản”. Web NCT hiển thị hai nguồn thật riêng và giải thích ý nghĩa.
- **Backend:** bỏ duy nhất UPDATE name/phone tài khoản trong onboarding. Giữ prefill phù hợp, tạo hồ sơ đúng JWT, duplicate contact/validation/transaction và không tạo hồ sơ thứ hai. Đăng ký mới tạo account+profile ban đầu không bị đổi.
- **Kiểm thử:** onboarding8/8; Chrome bốn kích thước với hai SĐT giả khác nhau; Flutter kiểm tra hai nguồn API và nhãn khác nhau. Không tự gọi API account khi lưu profile.
- **Giới hạn:** không triển khai quy trình đổi SĐT đăng nhập mới; việc đó cần luồng quản lý tài khoản/xác minh riêng. Không mở rộng chính sách xác thực. Quy tắc email hiện có không được sửa trong hạng mục name/phone.

## 5. AUD-13 — Chưa có ngưỡng không được kết luận bình thường

- **Nguyên nhân:** `LaBatThuong=false` bị UI hiểu thành đã đánh giá bình thường dù loại chỉ số min/maxNULL. Regression read-model FAIL trước sửa.
- **Sửa:** thêm metadata phản hồi tùy chọn `trangThaiDanhGia`: `BAT_THUONG`, `BINH_THUONG`, `CHUA_CO_NGUONG`. Giữ nguyên endpoint/request và các trường cũ để tương thích. Client đã sửa dùng metadata và fail-safe unknown khi thiếu metadata.
- **Quy tắc hiển thị:** cờ bất thường đã lưu ưu tiên; thiếu cả ngưỡng chính, hoặc có giá trị phụ nhưng thiếu cả ngưỡng phụ → “Chưa có ngưỡng đánh giá”, màu trung tính. Không tự đặt ngưỡng y khoa, tính lại cờ hoặc cập nhật lịch sử.
- **Áp dụng:** Web NCT/Admin/Người chăm sóc/Người thân, Mobile Trang chủ/Sức khỏe/lịch sử và màu điểm biểu đồ. Không mặc định check xanh khi thiếu ngưỡng. Tỷ lệ trong ngưỡng ở Web quản lý chỉ tính trên các lần có đánh giá; không có thì “—”.
- **Regression:** SQL CASE thật, API mapper, unit Web, Chrome360/768/1024/1440, Flutter320dp1.0/1.8x và full suite. Giá trị, đơn vị, thời gian, quyền đọc, validation và tạo cảnh báo không đổi.
- **Giới hạn:** metadata dựa catalog hiện hành và cờ đã lưu. Không tuyên bố có version ngưỡng lịch sử mà schema chưa lưu. Client cũ chưa cập nhật vẫn có các trường legacy; cần dùng đồng bộ phiên bản Web/Mobile mới.

## 6. AUD-14 — Tách giờ đo và giờ phát hiện cảnh báo

- **Nguyên nhân:** hai handler tạo số đo phát `thoiGianPhatHien=thoiGianDoUtc`. Hai regression fixed-clock FAIL trước sửa.
- **Sửa:** lấy `CanhBao.NgayTao` của chính alert vừa tạo, dùng tiện ích timezone đã kiểm chứng để phát `thoiGianPhatHien`. Thêm `thoiGianDo` riêng cho giờ đo.
- **Bảo toàn:** không đổi chính sách cảnh báo khi nhập muộn, không backdate alert, sửa timestamp lịch sử/SLA SOS/schema hoặc giá trị đo.
- **SQL thật:** số đo giả hôm qua13:05 giữ nguyên ngày giờ; alert tạo hiện tại; timestamp event khớp SQL; tuổi cảnh báo0–29giây hợp lý. Outer transaction rollback, side effect notification/socket được stub. Nhóm handler/time/SLA liên quan36 PASS.

## 7. AUD-15 — SĐT trùng lọt cập nhật và cạnh tranh

- **Trước:** Admin update và auth/me trả200 với SĐT đã dùng. Hai test tái hiện FAIL (200 thay vì409).
- **Sửa:** helper dùng transaction-owned applock `CareSenior.AccountIdentifiers` trước row lock. Kiểm tra trim/blank-null, loại trừ chính user, và va chạm phone với username số/username với phone.
- **Các writer tham gia:** Admin create/update; auth register/updateMe; tạo tài khoản kèm hồ sơ NCT; cấp account từ hồ sơ người chăm sóc. Onboarding không còn viết định danh theo AUD-12. Nhánh Google không ghi phone được giữ nguyên.
- **Atomicity:** auth update đưa email-check/account+caregiver-update vào cùng transaction; lỗi rollback. Không sửa middleware role hoặc quy tắc định dạng hiện có.
- **Response:**409 `PHONE_TAKEN`/`USERNAME_TAKEN`; lock timeout409 `ACCOUNT_IDENTITY_BUSY`. Không để ghi trùng rồi mới thất bại đăng nhập. Phone hồ sơ vẫn chỉ là liên hệ.
- **SQL thật:** hai transaction trên kết nối độc lập tranh một phone giả đang trống → một OK, một PHONE_TAKEN. Chính user giữ phone của mình được phép; user khác bị chặn. Cuối test khôi phục phone cũ và đối chiếu snapshot.
- **Giới hạn:** không tạo unique index hoặc sửa trùng lịch sử. Applock phối hợp writer CareSenior; SQL ngoài ứng dụng không được constraint phone bảo vệ. Index cần phê duyệt DB riêng, không tự chạy patch.

## 8. Kết quả kiểm thử

| Nhóm | PASS/FAIL/SKIP/NOT_RUN | Bằng chứng và giới hạn |
| --- | --- | --- |
| Backend toàn bộ | **500 PASS, 0 FAIL, 6 SKIP** | node --test, preload chặn network main/provider. SQL opt-in không tự chạy hoặc tự tạo DB. |
| Frontend toàn bộ | **369 PASS, 0 FAIL, 0 SKIP** | Toàn bộ unit/fixture/Chrome chạy tuần tự; 362.6giây. Không thay bằng kết quả từng nhóm. |
| Flutter toàn bộ | **516 PASS, 0 FAIL** | Unit/widget, bao gồm BP/reset/session/form và các ca mới. |
| Flutter analyze | **PASS — No issues found** | Bao gồm integration test mới. |
| SQL Phase2 | **6 PASS** | Parent+5subtests;42 lần kiểm instance/DB, Stage6 thật. |
| SQL hồi quy Rx + Socket.IO | **8 PASS** | Rx5 + Socket3; rollback-only, không event ra ngoài. |
| Chrome Phase2 riêng | **5 PASS** | Parent+4 kích thước, nhãn riêng/unknown/180% text. |
| Chrome appointment riêng | **3 PASS** | Parent+Admin360/CG1024; chặn past-time và409 reload. |
| Android Emulator native | **1 integration test PASS** | GPS giả106,10 accuracy5m; nhả sớm0POST; HOME/resume thật0POST. SOS/telephony RAM fixture. |
| Frontend production build | **PASS** | Có warning chunk lớn500kB. |
| Frontend lint | **PASS, 10 warnings** | Warning React có sẵn; không gọi là zero-warning. |
| Android APK debug main() | **PASS** | Build lại APK ứng dụng thường và cài lại bằng -r sau test; không mở app hoặc nối backend chính. |
| git diff --check | **PASS** | Kiểm tra cả tracked và file mới trước bàn giao. |
| Android điện thoại thật, khóa màn/cuộc gọi/thu hồi permission | **NOT_RUN** | Không suy rộng emulator thành nghiệm thu tất cả native. |
| Google provider / AI provider / loa vật lý | **NOT_RUN** | Hồi quy mock/fixture có chạy; không gọi provider hay phát SOS thật. |
| Web tài khoản thật/database chính | **NOT_RUN** | Backend chính giữ dừng theo phê duyệt. |

Các lần đỏ không bị giấu: Flutter lượt đầu3 FAIL vì fixture thiếu metadata mới nhưng còn mong “Bình thường”; đã sửa fixture thể hiện có đánh giá và thêm unknown rồi full516 PASS. Test mới chuyển profile/account trên cùng widget chưa remount được sửa lifecycle của test, không sửa app để né assertion. Chrome lượt đầu ca missing quá40giây, parent420giây hết hạn làm ca cuối bị hủy; missing chạy riêng PASS, timeout parent được tăng theo số ca và chạy lại tuần tự. Các assertion còn lại đã xác minh là fixture đo màu trong transition và hit-test khi modal chưa ở trạng thái cuối; Chrome virtual-time không đồng bộ với compositor timeline. Harness chỉ hoàn tất animation hữu hạn trong fixture trước đo, giữ animation vô hạn và các assertion/threshold nguyên vẹn. Chỉ retry tối đa một lần nếu Chrome chưa trả kết quả và chưa có bất kỳ application API call; không retry assertion, SOS hay thao tác ghi. Ca liên quan chạy lại10/10 PASS; toàn bộ suite đã chạy lại369/369 PASS, không bỏ assertion hoặc bỏ ca. Android lần đầu chưa hoàn tất; sửa test harness bơm frame/runAsync cho native GPS rồi chạy lại thành công. Không xóa assertion hoặc bỏ ca để lấy xanh.

## 9. Hồi quy bốn role

- Admin/Người chăm sóc: API quyền cũ, account creation/update, lịch khám/thuốc/cảnh báo, Chrome với RAM API. Không dùng tài khoản thật/main để test ghi.
- NCT: workspace riêng, onboarding, sức khỏe, thuốc/khám, SOS/thông báo/realtime, Google/AI fixture, session/logout/đổi account; full Flutter giữ các bản sửa BP/reset.
- Người thân: test read-only/phạm vi/thu hồi và Web fixture; chỉ thêm metadata đánh giá an toàn, không trả thêm GPS/CCCD/địa chỉ/ghi chú nội bộ.
- Không sửa Google linking, JWT, AI classifier/prompt, API confirm/status, CAS409 thuốc, policy GPS/lifecycle SOS, Bottom Navigation hoặc redesign UI.

## 10. Dữ liệu, môi trường và Git

- SQL ghi chỉ dùng **CareSeniorRelativesTest_Stage6_20261027** trên **DESKTOP-4FJVTFU\SQLEXPRESS**. Xác minh @@SERVERNAME/DB_NAME trước từng batch; inject pool vào controller/middleware; chặn import production config/db trong integration.
- Không tạo/drop DB, không chạy FINAL/patch/seed/migration, không thay schema. Không kết nối ghi QLSucKhoeNguoiCaoTuoi hoặc4fixture cũ. Không dùng checksum DB đang hoạt động để suy đoán thay đổi của ứng dụng khác.
- Appointments/reminders/metric/alert của Phase2 outer transaction rollback; số dòng trước/sau khớp. Race phone có commit trên account fixture để kiểm cạnh tranh thật rồi khôi phục và đối chiếu. INSERT rollback có thể tiêu thụ IDENTITY, không nói rằng chưa từng thực thi DML.
- Socket regression đổi account trong rollback-only transaction; Rx rollback ở commit boundary. Không server/worker chính; không SOS/email/cuộc gọi/notification thật.
- Android dùng test entrypoint, không main(), transport/telephony fake. Đã cấp location cho package trên emulator và inject tọa độ giả. Không sửa AndroidManifest/MainActivity. Sau test cài lại APK main() không xóa userdata và không tự mở app.
- Không commit/push/reset/clean. Đã đối chiếu baseline640 file, không thấy mất file; không hoàn tác thay đổi có sẵn. Giữ báo cáo cũ và mobile/design_reference. Nhãn liên hệ trong chi tiết hồ sơ Admin và nhãn tài khoản trong trang quản lý người dùng cũng được cập nhật, không thay payload hoặc validation.
- Một số evidence trong Windows Temp không còn ở cuối lượt; kết quả đã được quan sát qua tool. Các lần chạy tiếp lưu tại `C:/Users/Admin/Documents/ChatGPT/KLCN/phase2-evidence-20261028`. Không suy đoán nguyên nhân dọn Temp khi chưa có bằng chứng.

## 11. File sửa/tạo riêng của Đợt2

Đợt này có **36 file chỉnh sửa và14 file tạo mới (kể cả báo cáo)**. Danh sách không nhập nhằng với các file chỉ đã sửa từ đợt PRIORITY/HIGH; git diff tổng vẫn chứa cả các thay đổi có sẵn đó.

### Backend

- Sửa: `server/src/controllers/auth.controller.js`, `caregiverAccount.controller.js`, `chiSoSucKhoe.controller.js`, `lichKhamBenh.controller.js`, `mobileOnboarding.controller.js`, `nguoiDung.controller.js`.
- Sửa: `server/src/services/appointmentReminder.service.js`, `elderlyCreation.service.js`, `relativeRead.repository.js`.
- Tạo: `server/src/utils/accountIdentity.js`, `metricAssessment.js`.
- Sửa test: `server/test/caregiver-web-account.test.js`, `health-metric-time.test.js`, `mobile-onboarding.test.js`.
- Tạo test: `server/test/account-phone-conflict.test.js`, `phase2-appointments.test.js`, `phase2-health-alert.test.js`, `phase2-stage6.integration.test.js`.

### Frontend

- Sửa: `frontend/src/components/AccountMenuModals.jsx`, `ElderlyProfileFields.jsx`.
- Sửa: `frontend/src/pages/Appointments/AppointmentsPage.jsx`, `ElderlyPortal/ElderlyCareUi.jsx`, `ElderlyPortal/ElderlyPersonalProfile.jsx`, `HealthMetrics/HealthMetricsPage.jsx`, `Relatives/RelativePortalPage.jsx`, `ElderlyProfiles/ElderlyProfilesPage.jsx`, `Users/UsersPage.jsx`.
- Tạo: `frontend/src/utils/appointmentTime.js`, `metricAssessment.js`.
- Sửa test: `frontend/test/elderlyWorkspace.browser.test.js`, `frontend/test/fixtures/elderlyWorkspacePreview.jsx`, `appointmentConflictPreview.jsx`.
- Tạo test: `frontend/test/appointmentTime.test.js`, `metricAssessment.test.js`.

### Flutter

- Sửa: `mobile/lib/screens/caregiver/caregiver_elderly_detail_screen.dart`.
- Sửa: `mobile/lib/screens/health/health_dashboard_ui.dart`, `health_detail_screen.dart`, `health_screen.dart` — chỉ hiển thị, không đổi form reset/save đã sửa.
- Sửa: `mobile/lib/screens/home/elderly_home_screen.dart`, `home_dashboard_ui.dart`.
- Sửa: `mobile/lib/screens/profile/complete_profile_screen.dart`, `edit_profile_screen.dart`, `profile_screen.dart`.
- Tạo: `mobile/lib/utils/metric_assessment.dart`.
- Sửa test: `mobile/test/health_dashboard_ui_test.dart`, `home_dashboard_ui_test.dart`, `profile_dashboard_ui_test.dart`.
- Tạo test: `mobile/test/metric_assessment_test.dart`, `mobile/integration_test/phase2_sos_android_test.dart`.
- Tạo báo cáo: `reports/BUSINESS_LOGIC_FIX_PHASE2.md`.

## 12. Checklist Android còn lại và giới hạn demo

1. Dùng fixture hoặc Stage6 đã xác minh, không server5000/main. Không thử SOS thật.
2. GPS mới<=2phút, accuracy<=100m, tọa độ hữu hạn/hợp lệ → có GPS. GPS cũ/tương lai/sai số lớn/không xác định, mất quyền/disabled/timeout/mạng → SOS không GPS; không gắn cache cũ như vị trí hiện tại.
3. Giữ1–2giây rồi nhả/đổi tab/HOME/khóa màn/shade/cuộc gọi →0POST; quay lại cần phiên giữ mới đủ3giây liên tục.
4. Đủ3giây →1POST fixture; timeout/reconnect không retry; đổi account/phản hồi muộn không gửi sang phiên mới. Các ca có widget regression; tiếp tục đối chiếu các gián đoạn native còn thiếu.
5. Native test mới cần host cấp fine/coarse location cho package test, inject `adb emu geo fix 106 10`, đợi `PHASE2_ANDROID_WAIT_HOME`, bấm HOME và mở MainActivity lại ngay. Observer trong test xác nhận interruption thật; không giả định phần HOME tự diễn ra.
6. Trước đóng AUD-09/10: kiểm tra điện thoại thật, thu hồi permission trong lúc chờ GPS, cache cũ native, khóa/mở màn, cuộc gọi/shade/mất mạng. Emulator PASS một phần không đủ để tự chuyển thành FIXED.

Không mở rộng sang unique index, lịch sử AI bền vững, quy tắc y khoa, chính sách xác thực hoặc tính năng mới. **DỪNG sau Đợt2. Backend chính chỉ bật lại khi được duyệt riêng.**
