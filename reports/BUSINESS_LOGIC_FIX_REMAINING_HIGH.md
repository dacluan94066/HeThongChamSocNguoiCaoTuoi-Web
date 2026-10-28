# CareSenior — Sửa các lỗi CRITICAL/HIGH còn lại

Ngày: 28/10/2026. Project: D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI.

Phạm vi được duyệt: AUD-01, AUD-07, AUD-09, AUD-10; đối chiếu đủ 15 phát hiện ban đầu và bảo toàn ba bản sửa đã nghiệm thu. Không thiết kế lại UI, không triển khai chức năng mới.

## 1. Kết luận

- **AUD-01 FIXED:** kiểm tra lại account/role và hạn JWT trước phát dữ liệu, tự đóng socket khi JWT hết hạn; khóa tài khoản qua API ngắt tất cả socket của tài khoản sau khi SQL thành công.
- **AUD-07 FIXED:** UPDATE có điều kiện trạng thái, thời gian gốc và chủ hồ sơ; request thua trả 409 APPOINTMENT_CHANGED, không khôi phục lịch hủy/đã khám và không phát thông báo đổi lịch.
- **AUD-09 và AUD-10 PARTIALLY_FIXED:** bản sửa và regression tự động đã PASS; chưa đóng gate Android/GPS native theo tiêu chí kiểm toán ban đầu vì adb không có thiết bị.
- **Backend chính đang DỪNG, cổng 5000 trống**, không tự khởi động lại. SQL Server và Frontend được giữ chạy.
- **READY WITH LIMITATIONS cho demo cách ly có kiểm soát.** Chưa xác nhận production READY hoặc nghiệm thu SOS trên Android thật.

## 2. Trạng thái đủ 15 phát hiện

FIXED: đã sửa và có bằng chứng hồi quy trong phương thức ghi rõ. PARTIALLY_FIXED: code/test đã đạt nhưng còn gate thiết bị đã yêu cầu. OPEN: chưa sửa trong đợt này; cột bằng chứng nêu rõ nếu chỉ mới xác minh bằng source/catalog. NEEDS_VERIFICATION dành cho nghi ngờ chưa đủ căn cứ; không biến mọi mục SOURCE thành một ca E2E PASS.

| ID | Mức độ gốc | Trạng thái hiện tại | Đối chiếu và bằng chứng |
| --- | --- | --- | --- |
| AUD-01 | CRITICAL | **FIXED** | Lượt này: RED bằng Socket.IO thật + account fixture; GREEN 38 test socket/SOS; SQL Stage6 + Socket.IO 3 PASS. |
| AUD-02 | MEDIUM | **FIXED** | Đợt PRIORITY_3_FIXES: BP hai trường, không bắt HR; không đổi ID catalog. Full Flutter hiện tại vẫn PASS. |
| AUD-03 | HIGH | **FIXED** | Đợt trước: BP một POST, hết nhánh BP thành công/HR lỗi gây retry BP. Không sửa lại code sức khỏe. |
| AUD-04 | HIGH | **FIXED** | Đợt trước: reset theo loại/form mới/success, lỗi giữ draft và session guard. Test hiện tại vẫn PASS. |
| AUD-05 | MEDIUM | **FIXED** | Đợt trước: bỏ bắt buộc pulse trong BP, giới hạn BP dùng 50–300/30–200; HR riêng đi qua validation Backend hiện có. Không sửa ngưỡng y khoa. |
| AUD-06 | MEDIUM | **FIXED** | Đã chạy lại SQL thật: past-only trả 422, đơn/chi tiết/liều rollback; 5 PASS SQL, 9 ca Backend fixed-clock và Chrome preview/chặn submit nằm trong full suite. Không chỉ dựa vào báo cáo cũ. |
| AUD-07 | HIGH | **FIXED** | Lượt này: tái hiện hai kết nối SQL; GREEN 7 PASS SQL + 3 PASS Chrome Admin/CG. |
| AUD-08 | MEDIUM | **OPEN** | Tạo lịch khám chấp nhận giờ đã qua trong hôm nay; chưa đổi quy tắc đặt mới/lịch sử. |
| AUD-09 | HIGH | **PARTIALLY_FIXED** | Policy đã được người dùng duyệt; GPS mới/cache được kiểm tra, regression PASS; GPS/permission Android native NOT_RUN. |
| AUD-10 | HIGH | **PARTIALLY_FIXED** | Lifecycle/route/session invalidation, late GPS và request đã POST được kiểm tra; Android khóa màn/cuộc gọi/notification shade NOT_RUN. |
| AUD-11 | MEDIUM | **OPEN** | Whitelist nhắc khám chưa gồm CanChamSocDacBiet; bằng chứng source/predicate cũ, chưa sửa worker. |
| AUD-12 | MEDIUM | **OPEN** | Phone/name hồ sơ khác account; cần chốt ý nghĩa phone liên hệ/login trước sửa. |
| AUD-13 | MEDIUM | **OPEN** | Không có ngưỡng vẫn hiển thị nhãn bình thường; chưa đặt ngưỡng hay thay cờ lịch sử. |
| AUD-14 | MEDIUM | **OPEN** | Event dùng giờ đo làm giờ phát hiện; bằng chứng SOURCE, UI end-to-end chưa xác minh; không kết luận SLA SOS bị hỏng. |
| AUD-15 | MEDIUM | **OPEN** | Đường update thiếu kiểm phone trùng; SOURCE/CATALOG, chưa tạo trùng trên main. Constraint/schema cần duyệt riêng. |

Tổng theo 15 ID: **7 FIXED, 2 PARTIALLY_FIXED, 6 OPEN, 0 NEEDS_VERIFICATION**. Không cộng các rủi ro R-01…R-12 của báo cáo audit thành bug mới hoặc tuyên bố đã xử lý chúng.

## 3. AUD-01 — Socket sau khóa/hết JWT

### Trước sửa

Chạy lại socket-audit.cjs với socket.js thật và account/SQL fixture:
- HTTP sau khóa: 401.
- Socket Admin vẫn nhận 1 sự kiện sức khỏe sau khóa.
- Sau JWT hết hạn vẫn nhận thêm sự kiện, tổng 2.
- Không gửi SOS hoặc dữ liệu ra môi trường thật.

Regression mới trước sửa cũng thất bại ở các assertion chặn dữ liệu/hết hạn; ca helper disconnectUser chưa tồn tại là yêu cầu mới của bản sửa, không phải một lỗi production thứ hai.

### Sửa tối thiểu

- Giữ hệ thống Socket.IO, room, event name, payload và boolean return của các helper hiện có.
- Mỗi kết nối có mốc expiry lấy từ JWT đã xác minh; timer đóng kết nối khi hết hạn, dọn timer khi disconnect.
- emitToAdmin, emitToAdminOnly, emitToUser đi qua kiểm tra account HoatDong, role ID/name khớp JWT và expiry trước giao sự kiện. Không cache quyền account qua nhiều event.
- Lỗi đọc DB: không phát dữ liệu; không làm request nghiệp vụ đã commit trở thành thất bại.
- Giữ thứ tự sự kiện trên từng kết nối; chụp payload tại thời điểm enqueue.
- API khóa tài khoản gọi disconnectUser sau câu UPDATE SQL thành công; mở khóa không hồi sinh socket cũ, reconnect phải xác thực lại.
- Bộ lọc phân công/consent/payload Người thân vẫn do các producer hiện có kiểm soát; không cấp quyền mới và không coi room là quyền truy cập.

### Sau sửa

- 38 PASS trong nhóm socket/realtime/SOS bốn role.
- SQL thật Stage6 + Socket.IO thật: 3 PASS; tạm khóa Admin fixture trong transaction, phát sự kiện giả localhost, xác nhận không nhận rồi rollback.
- Account/role/status trước và sau SQL test bằng nhau; expiry tự đóng kết nối khi không có event mới.
- 1 test riêng kiểm tra SQL lock thành công mới ngắt socket; unlock/SQL lỗi không ngắt nhầm.
- Không thay chính sách JWT của HTTP, Google hoặc việc thu hồi phiên khi đổi mật khẩu (R-08 chưa xử lý).

## 4. AUD-07 — Stale edit khôi phục lịch hủy

### Trước sửa

- Bằng chứng audit SQL gốc: cancel 200/Huy, stale update 200/ChuaDen.
- Chạy RED hiện tại trên hai kết nối Stage6: cả stale edit sau cancel và hai lần reschedule cạnh tranh vẫn trả 200 thay vì 409.
- Hai ca business sai làm test cha FAIL; các ca metadata/normal cũ vẫn PASS. Đây là tái hiện lỗi, không phải lỗi môi trường.

### Sửa

UPDATE cuối kiểm tra đồng thời:
- LichKhamID;
- NguoiCaoTuoiID đã đọc;
- TrangThai đã đọc;
- ThoiGianKham gốc, giữ độ chính xác datetime2 trong phép so sánh bằng chuỗi VARCHAR(33) và CONVERT(DATETIME2(7)).

AffectedRows=0 trả 409 APPOINTMENT_CHANGED; không xóa nhắc lịch, chèn notification hay emit đổi lịch khi mutation không thành công.

Không thêm trường request/version hoặc đổi schema. Giữ hành vi sửa metadata không đổi giờ của lịch đã hủy/đã khám nếu API hiện tại cho phép. Không mở lại quyền dời lịch đã hoàn tất.

Web Admin/Người chăm sóc đóng form cũ, tải lại danh sách khi gặp đúng mã xung đột; interceptor hiển thị lỗi một lần, không tự gửi lại PUT. Không thiết kế lại trang.

### Sau sửa

SQL Stage6: **7 PASS** (6 ca + cha):
1. Hủy thắng; stale edit 409, trạng thái Huy giữ nguyên.
2. Hai reschedule: một 200, một 409; không có notification/event từ request thua.
3. Metadata không đổi giờ của lịch hủy vẫn 200/Huy như trước.
4. Ghi kết quả thắng; stale metadata 409, DaKham/kết quả giữ nguyên.
5. Snapshot datetime2 có phần giây thập phân không gây xung đột giả.
6. Reschedule bình thường vẫn thành công; các lịch có sẵn không đổi.

Chrome RAM fixture: **3 PASS**, Admin 360px và Người chăm sóc 1024px; một PUT, refresh, không replay, không unhandled rejection.

Giới hạn: đây là CAS cho các trường nghiệp vụ nêu trên, không phải cơ chế row-version toàn bộ các trường ghi chú. Không thay đổi chính sách sửa metadata hoặc API nhập lịch sử.

## 5. AUD-09/10 — SOS Mobile

### Chính sách GPS được duyệt riêng trong lượt này

- Tuổi tối đa 2 phút; sai số tối đa 100 m.
- Tọa độ hữu hạn, latitude trong ±90, longitude trong ±180.
- Timestamp tương lai/epoch quá cũ, accuracy không hữu hạn/không dương/không đủ tin cậy bị loại.
- Áp dụng cả GPS current và cache; kiểm tra lại quyền chia sẻ sau khi chờ GPS.
- Vị trí không đạt vẫn gửi SOS không tọa độ; không tạo vị trí thay thế.
- Cache hợp lệ được ghi rõ thời điểm ghi nhận trên Mobile.
- Payload vẫn chỉ noiDung, viDo, kinhDo theo contract cũ; không thêm accuracy/timestamp vào API.

### Lifecycle

- Hủy thao tác chưa gửi khi inactive/paused/hidden/detached, rời route/TickerMode hoặc đổi phiên.
- Sau resume cần một lần giữ mới đủ 3 giây.
- Generation guard bỏ kết quả GPS đến muộn của thao tác/phiên đã hủy.
- Nếu HTTP đã POST thì tiếp tục xử lý xác nhận thực của Backend; không nói chưa gửi và không tự gửi lại.
- Không sửa chống trùng Backend, service gửi SOS hoặc thao tác gọi điện thủ công.
- Chỉnh teardown để dừng ticker mà không báo thay đổi cho widget con đã bị tháo.

### Bằng chứng

Trước sửa: chạy lại 2 ca audit widget chứng minh GPS 30 ngày/sai số 8 km vẫn đi vào payload, và inactive/resumed vẫn POST sau thời gian giữ cũ.

Sau sửa: **16 regression test mới PASS**, cùng toàn bộ suite:
- Fixed clock cho biên 2 phút/100 m, future/NaN/invalid coordinates.
- Cache cũ/sai số lớn/future/tọa độ sai → 1 SOS không tọa độ.
- Cache mới/đủ chính xác → giữ contract payload và hiển thị giờ ghi nhận.
- Bốn trạng thái lifecycle → không POST cũ, giữ mới mới gửi.
- GPS pending rồi background → late result không POST.
- HTTP đã POST rồi background → vẫn hiển thị xác nhận thực.
- Đổi phiên/rời route → không gửi thao tác cũ.
- Mất quyền trong lúc chờ GPS → không gửi tọa độ.
- DeniedForever + API timeout → không giả success, không tự retry.

Toàn bộ là Geolocator/HTTP/phone fixture, không gửi SOS hay gọi điện thật. **Android native NOT_RUN**; vì vậy hai ID giữ PARTIALLY_FIXED, chưa đóng hoàn toàn theo gate của audit.

## 6. File của đợt này

### Code ứng dụng

- Sửa [socket.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/socket.js).
- Sửa [nguoiDung.controller.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/nguoiDung.controller.js): hook ngắt socket khi khóa.
- Sửa [lichKhamBenh.controller.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/lichKhamBenh.controller.js): CAS và 409.
- Sửa [AppointmentsPage.jsx](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/src/pages/Appointments/AppointmentsPage.jsx): xử lý xung đột.
- Sửa [sos_screen.dart](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/alerts/sos_screen.dart).
- Tạo [sos_location_policy.dart](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/utils/sos_location_policy.dart).

### Test/support

- Tạo server/test/socket-session-revocation.test.js.
- Tạo server/test/user-lock-socket.test.js.
- Tạo server/test/socket-stage6.integration.test.js.
- Tạo server/test/appointment-race-stage6.integration.test.js.
- Tạo server/test/stage6-test-safety.cjs.
- Sửa server/test/business-validation.test.js: fixture thêm originalTime đúng SELECT thực.
- Tạo frontend/test/appointmentConflict.browser.test.js.
- Tạo frontend/test/fixtures/appointmentConflictPreview.jsx.
- Tạo mobile/test/sos_safety_regression_test.dart.

Báo cáo này là file mới reports/BUSINESS_LOGIC_FIX_REMAINING_HIGH.md.

Tổng: **16 file của lượt này**, gồm 6 file có sẵn được sửa và 10 file mới (cả báo cáo). Không tính các thay đổi được bảo toàn từ đợt PRIORITY_3_FIXES.

## 7. Hồi quy cuối

| Nhóm | Kết quả cuối | Cách thực hiện |
| --- | --- | --- |
| Backend toàn bộ | **489 PASS, 0 FAIL, 5 SKIP / 494** | Mock/fixture + Socket.IO localhost; preload chặn main/provider. |
| Frontend toàn bộ | **362 PASS, 0 FAIL** | Gồm Chrome headless fixture thật, API/Socket.IO trong RAM. |
| Flutter toàn bộ | **512 PASS, 0 FAIL** | Unit/widget; không phải Android runtime. |
| Flutter analyze --no-pub | **PASS, No issues found** | Đã chạy trên source cuối. |
| npm run build | **PASS** | Warning bundle >500kB. |
| npm run lint | **PASS, exit 0** | 10 warning React có sẵn ngoài phạm vi. |
| Socket/SOS mục tiêu | **38 PASS** | Bốn role, expiry/lock/role change/DB failure và recipient rules cũ. |
| SQL Stage6 + Socket.IO | **3 PASS** | SQL thật, socket thật, account lock rollback. |
| SQL Stage6 lịch khám | **7 PASS** | Hai kết nối độc lập, handler/scope helper thật; socket stub. |
| SQL Stage6 đơn thuốc AUD-06 | **5 PASS** | Controller/SQL thật, rollback-only, 0 dòng test lưu lại. |
| Chrome xung đột lịch khám | **3 PASS** | Admin/CG, một PUT, refresh, không replay. |
| git diff --check + kiểm tra file mới | **PASS** | Kèm SHA256 đầu/cuối. |
| Android/GPS/permission native | **NOT_RUN** | adb devices -l không có thiết bị. |
| Google provider, AI provider, loa vật lý | **NOT_RUN** | Không gọi provider hoặc thử loa trong lượt này. |
| Web phiên người dùng thật/main smoke | **NOT_RUN** | Backend chính được giữ dừng theo phê duyệt. |

Năm opt-in SKIP trong suite Backend: medication-status Stage6, prescription Stage6, relatives SQL, appointment Stage6, socket Stage6. Ba nhóm prescription/appointment/socket đã chạy riêng như trên. Không bật relatives SQL vì test đó tạo database mới. Không cộng lại các test mục tiêu vào suite tổng vì có trùng và có parent/child.

Một lỗi harness SQL ban đầu import middleware mà chưa inject pool: module config mặc định thử đăng nhập với thông tin trống và bị SQL Server từ chối trước khi chạy query/DML. Đã sửa cách ly middleware và thêm guard chặn mọi import config/db thật trong các integration test mới. Không có DML/DDL trên main từ lần lỗi đó. Các lượt SQL GREEN cuối chỉ dùng pool Stage6 có guard.

## 8. An toàn dữ liệu và tiến trình

- Trước sửa: nodemon PID 4892, child Node PID 6616, listener 5000; .env cấu hình main. Restart do sửa source có thể chạy worker ghi main.
- Đã xin và nhận phê duyệt riêng; xác minh PID/command/parent/listener rồi dừng đúng Backend. Khi nodemon dừng, child cũng kết thúc; kiểm tra lại không còn cả hai PID/listener.
- **Không khởi động lại Backend chính.** Không đổi .env, cấu hình DB hay worker.
- Frontend PID 16280 vẫn chạy; SQL Server SQLEXPRESS vẫn Running. Không dừng tiến trình khác.
- Không schema/patch/seed/FINAL/migration; không tạo/xóa database; không commit/push/reset/clean.
- Snapshot đầu đợt: 630 file. Đối chiếu sau sửa chỉ 6 file có sẵn thuộc danh sách trên thay đổi; không có file baseline bị mất. Tất cả file PRIORITY_3_FIXES, báo cáo cũ và mobile/design_reference giữ nguyên hash.
- Các kiểm thử Node thường chặn truy cập main/provider qua preload. Test SQL mới inject pool và cấm import config/db production.
- SQL chỉ ghi thử trên **DESKTOP-4FJVTFU\\SQLEXPRESS / CareSeniorRelativesTest_Stage6_20261027**, xác minh instance + DB_NAME trước batch.
- Socket test rollback trạng thái account; prescription test rollback toàn bộ dòng. SQL identity Stage6 có thể tăng do cấp ID rồi rollback.
- Appointment test để lại **4 lịch giả ID 5,6,7,8**, marker HIGH_FIX_AUD07_*, và **6 thông báo đổi lịch nội bộ Stage6**. ID 5 thuộc lượt harness bị dừng sớm; không tự xóa. Các lịch có sẵn trước từng lượt không đổi.
- Read-only cuối xác nhận Stage6 vẫn 24 bảng, Admin fixture HoatDong. Không sửa/xóa bốn database fixture cũ.
- Không ghi database chính, không sửa dữ liệu sức khỏe thật, không phát SOS/email/cuộc gọi ra ngoài. Không dùng checksum để tuyên bố main đang hoạt động không đổi bởi các nguồn khác.

## 9. Gate còn lại và khả năng demo

**Demo Stage6 có kiểm soát: READY WITH LIMITATIONS.** Backend chính vẫn dừng; chỉ được mở lại sau phê duyệt riêng, chưa triển khai bước tiếp theo.

Cần kiểm tra Android trước đóng AUD-09/10:
1. Hold dưới 3 giây, kéo notification shade/khóa màn/cuộc gọi/rời tab rồi trở lại: không gửi.
2. Hold mới liên tục đủ 3 giây: chỉ một request; timeout không tự gửi lại.
3. GPS current/cache cũ, quyền bị thu hồi, accuracy kém: Stage6 nhận SOS không tọa độ.
4. Cache hợp lệ: Mobile ghi rõ giờ ghi nhận; Backend xác nhận thì mới báo thành công.
5. Background sau khi đã POST: kết quả thật vẫn được phản ánh, không tạo SOS thứ hai.

Không thử các ca này bằng SOS thật hoặc database chính.

Sáu MEDIUM còn OPEN được nêu ở bảng. Việc quyết định phone liên hệ/login, ngưỡng chưa cấu hình, cảnh báo số đo cũ và constraint phone cần duyệt riêng; không tự sửa chung trong đợt HIGH.

## 10. Bằng chứng

Thư mục: C:/Users/Admin/AppData/Local/Temp/caresenior-high-fixes-86545f8e317648a4aef942c483ce19e9

- git-before.txt, source-before.json, source-changes.json: baseline/hash.
- socket.before.js, appointments.before.js, sos.before.dart: source trước sửa.
- socket-before.log, socket-regression-before.log, socket-after.log, socket-sql-after.log.
- appointment-before.log, appointment-after.log, appointment-unit.log, appointment-browser.log.
- sql-final.log: 7 lịch khám + 5 đơn thuốc PASS; stage6-final-state.json: dữ liệu giả cuối.
- sos-before.log: hai ca chứng minh bug; flutter-all-final.log: toàn bộ 512 test sau sửa.
- backend-all.log, frontend-all.log, flutter-analyze.log, frontend-build.log, frontend-lint.log.
- diff-check.txt: không có lỗi whitespace.

Các lần test đang chứng minh bug hoặc lúc triển khai bản sửa bị đỏ được giữ trong log, không đổi tên chúng thành PASS. Kết quả tổng trong mục 7 là lượt chạy cuối sau khi sửa hoàn tất.

Dừng sau báo cáo; chưa tự sửa MEDIUM hoặc khởi động lại Backend chính.
