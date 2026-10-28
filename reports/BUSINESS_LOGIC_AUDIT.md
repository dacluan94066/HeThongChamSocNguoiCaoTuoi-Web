# CareSenior — Business Logic Audit

Ngày kiểm toán: **28/10/2026**. Project: D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI.
Git baseline: nhánh LuanBrandCodeNew, HEAD caafb52bf3e61a8cff0876957f61bf65e3564b68.
**AUDIT ONLY: chưa sửa lỗi nghiệp vụ hoặc triển khai thay đổi.**

## 1. Kết luận

**NOT READY để nghiệm thu toàn bộ nghiệp vụ là an toàn, nhất quán trong sử dụng thực tế.**

Đã xác minh nhiều bảo vệ tốt: scope hồ sơ, Người thân chỉ đọc và có thu hồi/consent, Google không tự ghép email, SOS chống trùng, hai API xác nhận thuốc chống ghi đè. Nhưng vẫn còn các đường đi tạo dữ liệu sai, mất hiệu lực thao tác hủy hoặc tiếp tục nhận dữ liệu sau khi mất quyền.

Các phát hiện đáng ưu tiên:

- Socket Admin đang mở vẫn nhận dữ liệu sức khỏe sau khi tài khoản bị khóa và JWT hết hạn.
- Mobile mang số từ loại chỉ số trước sang loại mới; giá trị được gửi dưới loại mới.
- Một lần lưu huyết áp gửi BP và HR bằng hai request; lỗi HR để lại BP đã lưu, retry nhân bản BP.
- Sửa lịch khám cạnh tranh với hủy có thể đưa lịch Huy trở lại ChuaDen. Đã tái hiện trên SQL Server Stage6.
- SOS Mobile gửi được cached GPS cũ 30 ngày mà không kiểm tra tuổi/độ chính xác.
- Tạo đơn thuốc có thể báo thành công với 0 liều; tạo lịch khám mới chấp nhận giờ đã qua trong hôm nay.

Không có bằng chứng người dùng thật đã bị ảnh hưởng. Không thử các tình huống này bằng dữ liệu thật hoặc SOS thật.

### Mức bằng chứng

| Trạng thái | Ý nghĩa |
| --- | --- |
| TÁI HIỆN SQL | Handler/SQL thật trên Stage6, kiểm tra trạng thái cuối |
| TÁI HIỆN SOCKET | Socket.IO thật, JWT/account/SQL thay bằng fixture trong bộ nhớ |
| TÁI HIỆN WIDGET | Flutter widget thật + transport/GPS giả; không phải Android runtime |
| TÁI HIỆN HANDLER | Controller thật + SQL mock, dùng đồng hồ cố định khi cần |
| SOURCE/CATALOG | Có bằng chứng code/schema/predicate; chưa chạy toàn luồng thiết bị |
| CHƯA XÁC MINH | Chưa đủ bằng chứng để gọi là bug thực tế |
| NOT_RUN | Chưa thực hiện tương tác/provider/thiết bị đó |

Severity và độ chắc chắn là hai chiều khác nhau. Một ca tái hiện bằng fixture không được gọi là đã kiểm tra Android thật.

## 2. Bảo toàn hệ thống

### Git/source

- Trước audit: tracked files sạch; có mobile/design_reference/ chưa theo dõi, 26 file có sẵn.
- Đã lập SHA-256 cho 624 file tracked/untracked hiện có; đối chiếu sau kiểm thử: **0 file đổi/mất**.
- Không sửa Backend, Frontend, Flutter, cấu hình hay test hiện có. Chỉ bổ sung báo cáo này trong repo.
- Script/log tái hiện nằm ngoài repo, trong thư mục tạm ở mục Bằng chứng.
- Không commit/push/reset/clean; không chạy patch, FINAL, migration, seed; không tạo/xóa database.

### SQL và cách ly

| Database | Thao tác audit |
| --- | --- |
| QLSucKhoeNguoiCaoTuoi | Chỉ SELECT catalog, schema, role, permission, unique index; xác nhận **24 bảng, 4 role** |
| CareSeniorRelativesTest_Stage6_20261027 | SELECT + dữ liệu giả cho kiểm thử thuốc/lịch khám; không chạy worker hoặc external delivery |
| Bốn fixture cũ / database restore | Không ghi, không sửa, không xóa |

Instance được xác minh: **DESKTOP-4FJVTFU\SQLEXPRESS**. Wrapper kiểm tra @@SERVERNAME và DB_NAME() trước mỗi batch ghi Stage6; xác minh tài khoản/hồ sơ fixture trước khi dùng. Không import server.js hoặc khởi động worker; socket/mailer được thay bằng stub.

Dữ liệu giả phát sinh tại Stage6, **giữ nguyên sau audit**:

- 18 liều thuốc ID **47–64**, ghi chú STAGE61_MEDICATION_CONCURRENCY_SYNTHETIC.
- Một lịch sử ghi nhận bổ sung cho liều thử nghiệm.
- Lịch khám ID **4**, cơ sở AUDIT_ONLY_APPOINTMENT_RACE, và thông báo đổi lịch nội bộ Stage6 do handler tạo.
- Các liều có sẵn và cả **3 lịch khám có sẵn không đổi**, đã so sánh trước/sau.
- Không tạo tài khoản, hồ sơ NCT hoặc database mới.

Không có DML/DDL trên main; không gọi GET /notifications/me trên main vì endpoint đó materialize thông báo. Không gửi SOS/email/cuộc gọi thật. Các tiến trình hiện có được giữ chạy, vì vậy không tuyên bố main bất biến theo thời gian hoặc dùng checksum để suy diễn truy cập trái phép; xác nhận ở đây là audit không ghi vào main.

## 3. Kiểm kê module

Đã đối chiếu **19 nhóm router**, **23 controller Backend**, các màn Flutter và **19 service**, các trang React, session/cache/realtime. Kiểm kê không đồng nghĩa đã chạy mọi tổ hợp request.

| Miền | API | Web/Mobile đã đối chiếu | Phương pháp/giới hạn |
| --- | --- | --- | --- |
| Auth/tài khoản/quyền | /auth, /users, /permissions | Login, AuthContext/webSession; AuthService/ApiClient | Source + mock/fixture; provider thật NOT_RUN |
| Hồ sơ/onboarding | /elderly, /elderly/me | ElderlyProfiles, ElderlyPersonalProfile; profile/edit/complete | Validation/schema, handler phone; không sửa hồ sơ thật |
| Phân công | /caregivers, /elderly/:id/caregiver | Caregivers, caregiver screens | Scope, ngày hiệu lực, trạng thái, quyền |
| Người thân | /relatives | RelativeAdmin/Portal, access/SOS stores | Liên kết, consent, projection, thu hồi; mock/fixture |
| Sức khỏe | /health-metrics, /health-metric-types, /elderly/me/health-metrics | HealthMetrics/ElderlyHomeHealth; HealthDetailScreen, HealthScreen cũ | Widget, catalog thật, validation/timezone |
| Thuốc | /medications, /elderly/:id/prescriptions, /medication-schedules, /medication-schedule | MedicationSchedule/Medications/ElderlySchedule; MedicationScreen | SQL cạnh tranh, ngày/giờ, tiến độ |
| Lịch khám | /appointments, /elderly/me/appointments | Appointments/ElderlySchedule; AppointmentScreen | SQL hủy/sửa cạnh tranh, handler quá khứ |
| SOS | /emergency-alerts | ElderlySos/Alerts/alarm; SosScreen | Source, Web safety fixture, widget GPS/lifecycle |
| Cảnh báo | /alerts | Dashboard/Alerts/SmartAlertCenter; AlertsHub | Workflow lock/transaction; SLA/timezone |
| Thông báo/nhắc | /notifications | Notification/header/local notifications | Source materializer/worker, local plan; native NOT_RUN |
| Nhật ký | /care-notes | CareNotes; caregiver notes | Validation, version/audit, soft-delete, tests |
| Liên hệ khẩn cấp | /emergency-contacts | EmergencyContacts/caregiver actions | Scope, phone, reorder transaction; không gọi điện |
| AI | /care-assistant/profiles,status,query,chat | ElderlyAssistant; CareAssistant/history | Domain, scoped SELECT tools, actions, session; provider NOT_RUN |
| Báo cáo | /reports/health-summary | Reports/dashboard | Scope; SQL → handler thật → dayjs Việt Nam |

### Chưa xác minh đầy đủ

- **Android/Emulator NOT_RUN**: adb devices -l không có thiết bị kết nối.
- Chrome tương tác bằng phiên người dùng thật, GPS thật, âm thanh qua loa vật lý, Gboard, Android background/Doze: NOT_RUN.
- Google/AI/email/OTP provider thật: NOT_RUN, không gọi bên ngoài.
- Cấp/cập nhật/thu hồi liên kết bằng SQL ghi thực trong lượt này: NOT_RUN; dùng mock/fixture và rà soát query. Không bật SQL test có cơ chế tạo database mới.
- Crash/mất điện/SQL disk-full/deadlock giữa các statement và sau commit: chưa fault-inject đầy đủ.
- Không chứng nhận mọi màn/role trên thiết bị thật từ kết quả unit hoặc Chrome headless fixture.

## 4. Ma trận quyền

Đối chiếu route/middleware/query và permission catalog. Permission không thay thế scope hồ sơ. Admin có bypass permission theo thiết kế; không cấp thêm quyền trong audit.

| Hành động | QuanTriVien | NguoiChamSoc | NguoiCaoTuoi | NguoiThan |
| --- | --- | --- | --- | --- |
| Web workspace | Quản trị | Chăm sóc | /ca-nhan | Người thân |
| Hồ sơ | Quản lý | Xem/sửa NCT phân công | Hồ sơ gắn UserID mình; hoàn thiện qua /me | Chỉ liên kết còn hiệu lực |
| Chỉ số | Xem/thêm | Phân công + permission | Của mình | Chỉ đọc theo quyền |
| Tạo đơn | Có | Phân công + permission | Không | Không |
| Xác nhận liều | Quy tắc ngày/trạng thái chung | Trong phân công | Liều của mình | Không |
| Ghi nhận bổ sung | API/lý do/thời hạn chung | Trong phân công | Liều của mình | Không |
| Lịch khám | Tạo/sửa/hủy/kết quả | Phân công + permission | Chỉ đọc | Chỉ đọc, kết quả cần consent |
| Gửi SOS qua create | Không gửi thay NCT | Không gửi thay NCT | Tự gửi | Không gửi thay |
| Tiếp nhận/xử lý SOS | Có | Phân công + permission | Không | Không |
| Nhận SOS | Theo quyền Admin | Account/phân công hợp lệ | Sự kiện của mình | Liên kết + consent + quyền xem hiện tại |
| Nhật ký | Quản lý/audit | Phân công, permission, tác giả/version | Không mặc nhiên ghi | Không qua API staff |
| Liên hệ khẩn cấp | Quản lý | Phân công + permission | Quyền hiện có | Không qua API staff |
| Liên kết Người thân | Admin quản lý | Không | Không | Không tự cấp |
| Mật khẩu | Của mình/reset bằng luồng Admin | Của mình | Của mình | Của mình, ngoại lệ hẹp |
| AI cá nhân | Không mặc nhiên dùng tools NCT/CG | Hồ sơ phân công | Hồ sơ mình | Không qua API AI NCT |
| Báo cáo | Có | Scope phân công | Bị permission từ chối | Từ chối |

Bảo vệ đã thấy:

- HTTP auth đọc lại account active/role trên mỗi request.
- Người thân có whitelist method/endpoint và guard chỉ đọc, kể cả permission matrix cấu hình nhầm.
- Query Người thân kiểm tra liên kết chưa thu hồi, đồng ý, account active, role và quyền hiện hành.
- Bệnh nền/dị ứng/kết quả khám được chiếu theo từng cờ; không trả CCCD/địa chỉ chi tiết/GPS/ghi chú xử lý nội bộ qua projection đã kiểm tra.
- Scope NCT/CG áp dụng cả Web/Mobile, không tin platform client.
- Thông báo Người thân đã lưu cũng kiểm tra lại quyền sau thu hồi; realtime recheck trước phát.
- Lỗ hổng room Admin sống lâu được ghi riêng AUD-01.

## 5. Ba vấn đề người dùng phát hiện

### 5.1 Lịch thuốc quá khứ

**Không tái hiện API tạo đơn đang dùng sinh liều 08:00 đã qua.** SQL hiện có WHERE ThoiGianDuKien > SYSDATETIME(), bỏ candidate quá khứ.

| Now Việt Nam | Candidate | Sinh theo predicate hiện tại |
| --- | --- | --- |
| 28/10 15:00 | 28/10 08:00 | Không |
| 28/10 15:00 | 28/10 20:00 | Có |
| 28/10 15:00 | 29/10 08:00 | Có |
| 28/10 23:59:01 | 28/10 23:59:00 | Không |
| 28/10 23:59:59 | 29/10 00:00:00 | Có |

Đây là SELECT kiểm tra predicate với giờ cố định, không giả vờ là E2E tạo đơn tại nửa đêm.

**Bug còn lại AUD-06:** đơn chỉ hôm nay, mọi cữ qua rồi, vẫn commit/201 nhưng 0 liều. Web đóng form sau success. Không áp dụng quy tắc sai “mọi HH:mm phải lớn hơn giờ bây giờ”.

Code create trong controller liều không có route POST trong router hiện hành; không dùng hàm chưa được mount để báo lỗ hổng API đang chạy.

### 5.2 Huyết áp hiện nhịp tim

**Chưa chứng minh bị hoán đổi ID.** Widget dùng catalog đúng xác nhận BP gửi ID loại BP, giaTriPhu; HR là request thứ hai với ID HR.

Đang xảy ra: HealthDetailScreen là form BP kết hợp HR, bắt cả ba số và gửi hai POST. Đây là nhầm lẫn UX và lỗi lưu một phần AUD-02/03.

Catalog Stage6: 1 Huyết áp/mmHg; 2 Nhịp tim/lần/phút; 3 Đường huyết/mg/dL; 4 Nhiệt độ cơ thể/°C; 5 SpO2/%; 6 Cân nặng/kg. Đây là giá trị đã quan sát, **không phải đề xuất hard-code**.

Fixture UI cũ dùng Nhiệt độ và ID khác catalog; cần bổ sung fixture hợp đồng thật, không gọi sự khác ID fixture là bug production.

### 5.3 Số cũ khi đổi loại

**Đã tái hiện AUD-04:** HR 85 → đóng → chọn SpO2 → mở mới vẫn 85 → POST SpO2 85. Sau success mở mới vẫn giữ số.

Không thấy bằng chứng dữ liệu tài khoản khác lọt qua transport có session guard. Không nâng lỗi giữ số giữa metric thành kết luận lộ dữ liệu giữa tài khoản.

## 6. Danh sách phát hiện

Tất cả chưa sửa.

| ID | Chức năng | Lỗi thực tế | Mức độ | Bằng chứng | Cách sửa | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| AUD-01 | Socket/quyền | Admin socket vẫn nhận sức khỏe sau khóa/hết JWT | CRITICAL | Socket thật; HTTP 401 nhưng vẫn có event | Thu hồi/expiry socket, recheck phát dữ liệu | TÁI HIỆN SOCKET |
| AUD-02 | BP form | Bắt HR khi chỉ muốn ghi BP | MEDIUM | BP đủ hai số, HR trống không POST | Tách phép đo/HR tùy chọn, tên rõ | TÁI HIỆN WIDGET |
| AUD-03 | BP save | Partial save, retry nhân bản BP | HIGH | [BP, HR lỗi, BP, HR lỗi], 2 BP được lưu | Retry phần chưa lưu hoặc tách thao tác | TÁI HIỆN WIDGET |
| AUD-04 | Form chỉ số | Số cũ chuyển loại/bản ghi mới | HIGH | HR 85 → SpO2 85 POST | Reset theo type/new-record, giữ draft khi lỗi | TÁI HIỆN WIDGET |
| AUD-05 | Validation | BP/HR local khác Backend | MEDIUM | 290/80 bị Mobile chặn, Backend cho tới 300 | Đồng nhất quy tắc đã duyệt | WIDGET/SOURCE |
| AUD-06 | Đơn thuốc | Success với 0 liều | MEDIUM | Fixed clock 15:00, 08:00 hôm nay, 201/count0 | Preview/skip rõ, từ chối zero-dose | HANDLER + SQL predicate |
| AUD-07 | Lịch khám | Stale edit khôi phục lịch hủy | HIGH | Hai SQL session, Huy → ChuaDen, cả 200 | CAS/lock/recheck + affectedRows | TÁI HIỆN SQL |
| AUD-08 | Tạo lịch khám | Chấp nhận giờ đã qua hôm nay | MEDIUM | 15:00 tạo 08:00 → 201 | Validate datetime, tách lịch sử | TÁI HIỆN HANDLER |
| AUD-09 | GPS SOS Mobile | Gửi cached GPS quá cũ | HIGH | Vị trí 30 ngày/accuracy8km vẫn gửi | Freshness/accuracy, fallback không GPS | TÁI HIỆN WIDGET |
| AUD-10 | SOS lifecycle | Inactive/resumed không hủy hold | HIGH | Widget vẫn POST sau gián đoạn | Invalidate hold theo lifecycle | WIDGET; Android NOT_RUN |
| AUD-11 | Nhắc khám | Loại NCT CanChamSocDacBiet | MEDIUM | Appointment predicate0, medication1 | Thống nhất trạng thái đủ điều kiện | SOURCE/SQL predicate |
| AUD-12 | Hồ sơ/account | Đổi phone/name hồ sơ không đồng bộ account | MEDIUM | PUT phone200, NguoiDung phone không đổi | Chốt nghĩa trường, sync an toàn nếu cùng nghĩa | TÁI HIỆN HANDLER |
| AUD-13 | Đánh giá | Chưa có ngưỡng vẫn ghi bình thường | MEDIUM | Weight min/maxNULL + UI nhãn xanh | Trạng thái chưa cấu hình/trung tính | SOURCE/CATALOG |
| AUD-14 | Cảnh báo số đo cũ | Event dùng giờ đo làm giờ phát hiện | MEDIUM | thoiGianPhatHien = thoiGianDoUtc | Tách giờ đo và giờ tạo cảnh báo | SOURCE, UI chưa chạy |
| AUD-15 | Phone login | Update không chặn phone trùng; main thiếu unique phone | MEDIUM | Catalog + UPDATE chỉ kiểm email; login fail closed | Validate mọi đường ghi; index cần duyệt | SOURCE/CATALOG |

**Tổng: 1 CRITICAL, 5 HIGH, 9 MEDIUM, 0 LOW.** Các rủi ro CHƯA XÁC MINH không cộng vào bảng bug.


## 7. Chi tiết lỗi và test case

### AUD-01 — Socket tiếp tục nhận dữ liệu sau mất quyền

- Module: Backend Socket.IO / Web. **CRITICAL**, liên quan dữ liệu sức khỏe mới sau khi không còn quyền.
- File: [socket.js](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/socket.js:25), handshake tới dòng 57, join admin dòng 67, emitToAdmin dòng 74, emitToAdminOnly cuối file. Đối chiếu [HTTP auth](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/middlewares/auth.middleware.js:33).
- Tái hiện: server Socket.IO cách ly; account mock Admin hoạt động; JWT giả hết hạn sau 2 giây; kết nối, chuyển account thành KhoaTaiKhoan; gọi HTTP auth, phát chisuckhoe:new bằng helper thật; đợi JWT hết hạn, phát tiếp.
- Hiện tại: HTTP **401**; client nhận **cả 2 event** sau khóa và sau expiry.
- Mong muốn: ngừng dữ liệu mới khi mất quyền/hết phiên, kể cả socket chưa reconnect.
- Nguyên nhân: xác thực chỉ lúc handshake; room Admin tồn tại suốt kết nối, không expiry/revalidation ở helper phát chung.
- Giới hạn: chưa khóa Admin thật. SOS mới có kiểm tra recipient riêng; không suy ra mọi event SOS đều lộ.
- Sửa tối thiểu: expiry timer, thu hồi kết nối theo user khi khóa; recheck recipients của event nhạy cảm. Không chỉ ẩn UI.
- Ảnh hưởng: bốn role, nhiều tab, reconnect, health/appointment/alert realtime. Test HTTP và socket đồng nhất, không làm mất SOS hợp lệ.

### AUD-02 — BP bắt buộc có HR

- Module: Flutter Sức khỏe. **MEDIUM**.
- File: [health_detail_screen.dart:98](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/health/health_detail_screen.dart:98), pulse validation 101–120, fields gần 264.
- Tái hiện: chọn Huyết áp; nhập 139/81; HR trống; Lưu.
- Hiện tại: “Nhập huyết áp và nhịp tim hợp lệ trước khi lưu”, không POST.
- Mong muốn: có thể ghi phép đo BP có đủ hai số; không buộc đoán HR chưa đo. Nếu form kết hợp thì tên/hướng dẫn phải nói rõ.
- Nguyên nhân: nhánh BP bắt buộc pulse và tìm type HR.
- Bằng chứng: widget thật + fixture. BP không gửi dưới ID HR; là hai phép đo.
- Sửa tối thiểu: BP/HR độc lập hoặc HR tùy chọn rõ ràng; không lấy số HR cũ.
- Ảnh hưởng: form và AUD-03; không cần thay đơn vị/schema.

### AUD-03 — Partial save rồi retry nhân bản BP

- Module: Mobile → HealthMetricService → Backend. **HIGH**.
- File: [health_detail_screen.dart:122](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/health/health_detail_screen.dart:122), hai await tới 134, catch 168–181; [service](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/services/health_metric_service.dart:123).
- Tái hiện: BP139/81 + HR77; fixture BP thành công, HR422; sau thông báo lỗi bấm Lưu lần nữa.
- Hiện tại: requests type [1,2,1,2], **2 BP đã lưu, 0 HR**.
- Mong muốn: thông báo phần đã lưu; không tạo lại BP chỉ vì HR lỗi.
- Nguyên nhân: hai HTTP request không có transaction chung, không ghi nhận tiến độ từng phần.
- Một POST riêng atomic không làm cả cặp atomic. Guard pending hiện có chặn nhấn đồng thời, nhưng không chặn retry sau lỗi.
- Sửa tối thiểu: tách thao tác/kết quả từng phép đo. Nếu muốn batch atomic/idempotency cần duyệt hợp đồng riêng; không thêm auto-retry.
- Ảnh hưởng: history/chart/statistics và cảnh báo trùng. Cần thêm test timeout sau commit, không chỉ lỗi 422.

### AUD-04 — Controller mang số cũ sang phép đo mới

- Module: Mobile HealthDetailScreen. **HIGH** vì giá trị hợp lệ về số nhưng sai loại thực tế.
- File: [state/controller:20](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/health/health_detail_screen.dart:20), dùng _value dòng135, mở sheet289, chip gần438. Nhánh [HealthScreen cũ:175](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/health/health_screen.dart:175) chỉ thay selectedId, cần rà lại nếu còn reachable.
- Tái hiện: HR nhập85 → đóng → chọn SpO2 → mở mới → Lưu.
- Hiện tại: có85 sẵn và POST SpO2=85. Sau success, đóng/mở bản ghi mới vẫn85.
- Mong muốn: bản ghi/loại mới trống; success reset; lỗi giữ draft cùng loại để sửa.
- Nguyên nhân: controller sống cùng screen, thiếu vòng đời draft theo type/new-record.
- Bằng chứng: widget thật. SpO2=85 vẫn nằm trong khoảng Backend, nên range validation không phát hiện số nhập nhầm.
- Sửa tối thiểu: reset theo type/new-record/success; xác nhận khi bỏ draft chưa lưu; không xóa số khi request lỗi.
- Ảnh hưởng: controllers BP/HR, thêm/sửa, retry, session; không cho draft đi sang account khác.

### AUD-05 — Khoảng hợp lệ không thống nhất

- Module: Mobile/Backend. **MEDIUM**.
- File: [Mobile:99](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/health/health_detail_screen.dart:99) và [Backend limits:1](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/utils/healthMetricValidation.js:1).
- Hiện tại: local BP40–280, pulse25–240; Backend BP50–300, HR20–250.
- Tái hiện widget: BP290/80 + HR77 bị chặn trước POST dù hợp lệ theo Backend. BP45/35 có thể qua local nhưng Backend từ chối.
- Mong muốn: cùng quy tắc hợp lệ; Backend vẫn quyết định cuối.
- Nguyên nhân: hằng số lặp độc lập.
- Sửa: dùng chính sách đã duyệt, tách giới hạn hợp lệ khỏi ngưỡng cảnh báo. Không tự thay ngưỡng y khoa.
- Ảnh hưởng: form, lỗi theo trường, precision; vẫn lưu được số bất thường nhưng hợp lệ.

### AUD-06 — Đơn thuốc thành công nhưng không có liều

- Module: Backend/Web thuốc. **MEDIUM**.
- File: [donThuoc.controller.js:249](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/donThuoc.controller.js:249), count254, commit267, response274–286; [Web:270](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/src/pages/MedicationSchedule/MedicationSchedulePage.jsx:270), success/đóng form310.
- Tái hiện: fixed now28/10/2026 15:00 Việt Nam; bắt đầu=kết thúc28/10; thuốc08:00; SQL mock generatedCount0 theo predicate đã kiểm chứng.
- Hiện tại: commit đơn/chi tiết, HTTP201, count0.
- Mong muốn: không kết thúc như kế hoạch đã tạo đầy đủ; hiển thị liều đầu, cữ bỏ qua và từ chối nếu không sinh liều tương lai.
- Nguyên nhân: có lọc candidate quá khứ nhưng thiếu kiểm tra kết quả cuối.
- Sửa: tính theo ngày+giờ, chốt now trong transaction; recheck qua00:00. Ngày mai08:00 vẫn hợp lệ. Giữ luồng ghi nhận quá khứ có chủ đích riêng.
- Ảnh hưởng: tạo đơn, thời hạn mặc định30ngày, thông điệp số liều; không sửa đơn cũ.

### AUD-07 — Sửa lịch khám cũ ghi đè Hủy

- Module: Backend/SQL/Web lịch khám. **HIGH**.
- File: [update:329](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/lichKhamBenh.controller.js:329), status check344, UPDATE361–367 chỉ WHERE ID; [cancel:429](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/lichKhamBenh.controller.js:429).
- Tái hiện SQL thật: lịch giảID4 tương lai; sessionA đọcChuaDen rồi dừng ở barrier; sessionB cancel200, SQLHuy; thảA sửa giờ.
- Hiện tại: A200, SQL cuối **ChuaDen**; lịch bị hủy sống lại, có thể sinh thông báo đổi lịch.
- Mong muốn: stale request không khôi phục Huy/DaKham, nhận409 và tải lại.
- Nguyên nhân: SELECT trước ngoài bảo vệ trạng thái của UPDATE cuối.
- Bằng chứng: hai SQL pool độc lập, handler thật, guard instance/DB, socket stub; 3 lịch có sẵn không đổi.
- Sửa tối thiểu: CAS hoặc lock/recheck trong transaction; affectedRows0→409; chỉ tạo notification khi mutation thành công.
- Ảnh hưởng: reschedule/cancel/result đồng thời, nhắc lịch, đổi NCT và permission. Không rewrite module.

### AUD-08 — Tạo lịch khám mới vào giờ đã qua

- Module: Backend/Web. **MEDIUM**.
- File: [create:282](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/lichKhamBenh.controller.js:282), đối chiếu update341.
- Tái hiện handler: now15:00 Việt Nam, POST hôm nay08:00.
- Hiện tại:201, ChuaDen. Worker chỉ nhắc tương lai nên lịch không được nhắc.
- Mong muốn: đặt lịch mới validate cả ngày và giờ. Nếu hỗ trợ lịch sử, tách luồng rõ ràng.
- Nguyên nhân: create chỉ so ngày với todayVietnam.
- Bằng chứng: controller thật/SQLmock; không tạo lịch quá khứ trên main.
- Sửa: kiểm tra datetime theo hợp đồng Việt Nam; không cấm máy móc nhập lịch sử đã được duyệt.
- Ảnh hưởng: Admin/CG form và lỗi field; API đọc Mobile không cần đổi.

### AUD-09 — Cached GPS SOS quá cũ

- Module: Flutter SOS. **HIGH**.
- File: [sos_screen.dart:147](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/alerts/sos_screen.dart:147), fallback155–164, gửi185–189.
- Tái hiện widget: permission hợp lệ; currentPosition lỗi; lastKnown30ngày trước, accuracy8000m.
- Hiện tại: vẫn gửi tọa độ cũ; payload không có tuổi/accuracy để recipient đánh giá.
- Mong muốn: kiểm tra freshness/accuracy theo chính sách sản phẩm; không phù hợp thì SOS không GPS, giải thích rõ.
- Nguyên nhân: tin mọi lastKnown khác null.
- Bằng chứng: widget/Geolocator fake, không dùng vị trí thật.
- Sửa tối thiểu: lọc fallback trước gửi, không bịa vị trí. Muốn truyền độ tin cậy phải duyệt contract riêng.
- Ảnh hưởng: GPS/UX Mobile; giữ đủ3giây, chống trùng và SOS không GPS.

### AUD-10 — Hold không bị hủy theo lifecycle

- Module: Flutter SOS. **HIGH**; giới hạn bằng chứng nêu rõ dưới đây.
- File: [sos_screen.dart:23](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/alerts/sos_screen.dart:23), animation27, start91, stop102; không lifecycle observer tương ứng.
- Tái hiện: widget giữ1giây → inactive → resumed → đủ tổng thời gian; có1POST dù không bắt đầu phiên giữ mới.
- Mong muốn: gián đoạn app làm hủy hold; quay lại giữ mới liên tục đủ3giây.
- Nguyên nhân: chỉ dựa gesture/ticker, không invalidate theo lifecycle.
- Giới hạn: Android có thể phát pointerCancel ở một số tình huống. **Chưa chứng minh mọi Android gửi nhầm** khi khóa màn/notification shade/cuộc gọi; native NOT_RUN.
- Sửa: lifecycle invalidation, kiểm tra tính hiện hành trước send, test pointerCancel/route/pause.
- Ảnh hưởng: Mobile SOS; không đổi idempotency Backend. Cần Android thật trước đóng lỗi.

### AUD-11 — NCT chăm sóc đặc biệt thiếu nhắc khám

- Module: Backend reminder. **MEDIUM**.
- File: [appointmentReminder:39](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/services/appointmentReminder.service.js:39); đối chiếu [medicationReminder:35](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/services/medicationReminder.service.js:35).
- Hiện tại: appointment whitelist chỉ DangTheoDoi; medication và tạo đơn cho phép CanChamSocDacBiet.
- Bằng chứng SELECT predicate VALUES: trạng thái đặc biệt cho appointmentEligible0, medicationEligible1.
- Mong muốn: hồ sơ vẫn được chăm sóc không mất nhắc khám chỉ vì chuyển sang trạng thái đặc biệt.
- Nguyên nhân: whitelist không đồng nhất.
- Sửa: danh sách trạng thái dùng chung sau duyệt; test cả ngừng theo dõi.
- Giới hạn: không khởi động worker/nhận notification native thật.
- Ảnh hưởng: worker và GET materializer; không tự mở cho hồ sơ đã ngừng theo dõi.

### AUD-12 — Phone/name hồ sơ và account không thống nhất

- Module: Web/Mobile hồ sơ + Backend. **MEDIUM**.
- File: [updateMe:74](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/hoSoNguoiCaoTuoi.controller.js:74), UPDATEprofile102; chỉ email syncND111. [Web adapter:59](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/src/utils/elderlyCare.js:59), [Mobile edit:173](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/profile/edit_profile_screen.dart:173).
- Tái hiện handler: đổi phone giả A→B; API200 và profileGET trảB; **0 câu UPDATE phone NguoiDung**. Login dùng NguoiDung.SoDienThoai tại auth.controller.js:482–484.
- Hiện tại: thấyB trong hồ sơ nhưngB chưa là định danh đăng nhập; tên account/header có thể khác tên hồ sơ.
- Mong muốn: nếu phone liên hệ khác phone login phải ghi rõ; nếu cùng nghĩa thì cập nhật nhất quán.
- Nguyên nhân: hai nguồn dữ liệu, chỉ email được sync.
- Sửa tối thiểu: chốt nghĩa trường; đồng bộ credential field cần validation/unique/xác minh phù hợp, không tự ghép account.
- Ảnh hưởng: auth/recovery/header/Web–Mobile; không đổi GoogleSubject.

### AUD-13 — Không có ngưỡng nhưng báo bình thường

- Module: Backend đánh giá/Web/Mobile. **MEDIUM**.
- File: [evaluateMetric:23](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/chiSoSucKhoe.controller.js:23), [Web tag:51](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/frontend/src/pages/ElderlyPortal/ElderlyCareUi.jsx:51), [Mobile status:102](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/mobile/lib/screens/health/health_dashboard_ui.dart:102).
- Bằng chứng: catalog Cân nặng có min/maxNULL; evaluateMetric không thấy out-of-range nên false; UI false→Trong ngưỡng/Bình thường.
- Hiện tại: “không bị đánh dấu bất thường” trở thành “đã đánh giá bình thường”.
- Mong muốn: Chưa có ngưỡng đánh giá/trạng thái trung tính, vẫn hiện số và đơn vị.
- Sửa: phân biệt unknown/normal/abnormal từ cấu hình; **không tự đặt ngưỡng y khoa**.
- Ảnh hưởng: cards/history/trend, dữ liệu cũ thiếu ngưỡng; không sửa LaBatThuong lịch sử.

### AUD-14 — Lẫn giờ đo và giờ phát hiện cảnh báo

- Module: Backend health event. **MEDIUM**, SOURCE; toàn luồng UI chưa chạy.
- File: [general create:480](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/chiSoSucKhoe.controller.js:480), INSERTalert506, payload539; [FINAL:383](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/QLSucKhoeNguoiCaoTuoi_FINAL.sql:383) đặt NgayTao mặc định giờ ghi nhận.
- Test case cần chạy: nhập hôm nay số đo bất thường của hôm qua; đối chiếu event với cảnh báo vừa tạo.
- Hiện tại theo source: event thoiGianPhatHien=thoiGianDoUtc, nhưng alert được tạo hiện tại.
- Mong muốn: giữ riêng đo-lúc và hệ-thống-ghi-nhận-lúc; tránh nhầm một số đo nhập muộn là mới đo.
- Nguyên nhân: reuse timestamp phép đo cho event cảnh báo.
- Sửa: lấy timestamp alert vừaINSERT cho event, giữ measuredAt riêng.
- Không kết luận SLA SOS hỏng: SLA regression vẫnPASS, không sửa timestamp lịch sử.
- Ảnh hưởng: sort/filter/event consumers; policy cảnh báo số đo cũ cần duyệt, không tự đổi.

### AUD-15 — SĐT trùng lọt đường cập nhật

- Module: Backend account/login/SQL. **MEDIUM**, SOURCE/CATALOG.
- File: [Admin update:295](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/nguoiDung.controller.js:295), kiểm email rồiUPDATEphone316; [auth update:903](D:/DoAnTotNghiep/DOAN_QLSUCKHOENGUOICAOTUOI/server/src/controllers/auth.controller.js:903), UPDATE927; login487 từ chối nếu số kết quả khác1.
- Catalog main: unique username/email/GoogleSubject; không có unique phone đã áp dụng. Có patch_unique_phone.sql nhưng audit không chạy.
- Test case sau duyệt: hai account giả, sửa một account sang phone account kia rồi login phone.
- Hiện tại từ source: update không kiểm phone trùng; login **fail closed401**, không tùy tiện chọn một account.
- Mong muốn: lỗi phone trùng tại lúc sửa, không để user phát hiện bằng lỗi login chung.
- Không phải bypass mật khẩu/đăng nhập nhầm; ảnh hưởng là định danh phone mất khả dụng.
- Sửa: unique validation mọi đường ghi; constraint sau kiểm dữ liệu và phê duyệt DB riêng; chuẩn hóa blank/null và namespace identifier.
- Giới hạn: chưa tạo trùng thật và **không kết luận main hiện có SĐT trùng**.


## 8. Rủi ro và chính sách chưa xác minh

Không cộng các mục dưới đây vào số bug đã xác định.

| ID | Điều kiện / bằng chứng | Trạng thái | Việc cần làm trước khi sửa |
| --- | --- | --- | --- |
| R-01 | General health create INSERT metric rồi INSERT alert cùng batch nhưng không transaction như createMine | CHƯA XÁC MINH lỗi SQL thực giữa hai statement | Fault injection Stage6, kiểm tra partial commit/rollback; không gây lỗi main |
| R-02 | Xác nhận liều kiểm đúng ngày Việt Nam nhưng không chặn giờ sớm trong ngày | Hành vi source rõ, chưa chốt chính sách là bug | Chốt quy tắc ghi nhận sớm/cảnh báo; không tự đặt cửa sổ y khoa |
| R-03 | Thuốc trùng trong một đơn bị chặn; hai đơn khác cho phép cùng thuốc | Không mặc định là bug | Chốt đơn thay thế, chồng lịch, dùng phối hợp và cơ chế ngừng đơn |
| R-04 | Tạo đơn dùng SYSDATETIME; nơi khác dùng UTC/zone | Host hiện tại đúng Việt Nam; host UTC CHƯA XÁC MINH | Chốt ngữ nghĩa clock, kiểm thử host khác zone trước thay đổi toàn cục |
| R-05 | DELETE hồ sơ thiếu guardResource nhưng CG hiện không có permission xóa | Rủi ro cấu hình, chưa có khai thác hiện tại | Nếu cấp quyền xóa CG vẫn phải scope; không bật quyền trên main để thử |
| R-06 | Report mặc định ngày theo host Node; Mobile có today theo timezone thiết bị | CHƯA XÁC MINH ở ngoài Việt Nam | Fixed clock sát nửa đêm, host UTC, thiết bị đổi zone |
| R-07 | Chrome 360px/1,8× có một lần submit modal không hit-test; chạy riêng lại PASS | CHƯA XÁC MINH bug ổn định | Kiểm tra thủ công scroll/zoom/keyboard, phân biệt animation/timing fixture |
| R-08 | Đổi/reset mật khẩu chưa có token version theo user để thu hồi mọi JWT | Chính sách cần duyệt | Giữ phiên độc lập hay thu hồi toàn bộ? Không tự thay auth |
| R-09 | Offline Mobile không biết ngay liều vừa xác nhận từ Web | Giới hạn đồng bộ | Đo refresh/reconcile khi online/resume; không hứa realtime offline |
| R-10 | POST số đo/đơn không có idempotency key bền vững | CHƯA XÁC MINH timeout sau commit toàn luồng | Fault injection sau commit; hướng dẫn kiểm tra lịch sử trước retry |
| R-11 | Đứt mạng khi thu hồi Người thân có thể trì hoãn purge dữ liệu đang hiển thị | Mock/fixture hồi quy; network partition thực NOT_RUN | Kiểm quyền mới, purge/reconnect/focus, bảo toàn quyền với NCT khác |
| R-12 | Ngưỡng/chỉ định lâm sàng chưa cấu hình hoặc chưa được đánh giá chuyên môn | Ngoài kết luận y tế của audit phần mềm | Không tự đặt ngưỡng điều trị, chẩn đoán hoặc thay thuốc |

### Nghi ngờ đã loại khỏi danh sách bug

- BP không bị hoán đổi ID thành HR trong fixture dùng catalog đúng.
- Không chứng minh đổi chip xuyên qua modal bằng tương tác bình thường: tap bị modal chặn. Không gọi callback trực tiếp rồi coi là thao tác người dùng.
- Danh mục thuốc TrangThai=0 được ghi rõ “Không tạo đơn mới”, không phải hủy y lệnh. Lịch cũ còn nhắc chưa đủ để gọi bug.
- /confirm và /status không còn ghi đè DaUong trong các interleaving SQL đã chạy.
- Không tìm thấy GPS/CCCD trong projection Người thân đã rà soát.
- Report không lệch 7 giờ ở mẫu SQL thật đã kiểm: SQL 26/10 23:55 → API wall string 26/10 23:55 → dayjs Việt Nam 26/10 23:55. Outer SELECT có CONVERT, không kết luận từ raw field ở OUTER APPLY.
- Giá trị bất thường nhưng còn hợp lệ không phải dữ liệu cần từ chối; không đánh đồng ngưỡng cảnh báo với giới hạn nhập.

## 9. Đề xuất validation và hành vi thống nhất

**Chờ duyệt, chưa triển khai.** Dùng giới hạn Backend đã có, không tạo quy tắc y khoa mới.

| Loại | Giới hạn hợp lệ hiện tại | Đơn vị / trường |
| --- | --- | --- |
| Huyết áp | Tâm thu 50–300; tâm trương 30–200; tâm thu > tâm trương | Hai số, mmHg |
| Nhịp tim | 20–250 | lần/phút |
| Đường huyết | 20–800 | mg/dL; kiểm DonVi catalog |
| Nhiệt độ cơ thể | 30–45 | °C |
| SpO2 | 50–100 | % |
| Cân nặng | 10–300 | kg |

### Sức khỏe và form

- ID từ catalog, không từ index/icon; tên, đơn vị, fields và payload dùng cùng type object.
- Đồng nhất precision và dấu phẩy/chấm; không tự cấm số thập phân khi policy chưa chốt.
- Backend từ chối NaN/Infinity/chữ, thiếu một nửa BP, ngày không tồn tại hoặc tương lai; thông điệp tiếng Việt theo field.
- Giới hạn hợp lệ tách khỏi min/max theo dõi; số bất thường còn hợp lệ được lưu và cảnh báo.
- Form thêm mới/type mới trống; success reset; lỗi giữ draft cùng loại; bỏ draft chưa lưu có thông điệp rõ.
- Nút pending chống double-submit. Timeout không chứng minh chưa ghi: báo chưa rõ kết quả, kiểm tra lịch sử trước retry.
- Không có ngưỡng thì nhãn trung tính; không sửa cờ lịch sử để làm UI đẹp.

### Đơn và liều thuốc

- Validate candidate datetime đầy đủ theo Việt Nam; ngày mai 08:00 vẫn hợp lệ dù hôm nay 15:00.
- Quy tắc bỏ cữ đã qua hôm nay phải hiển thị trước submit; preview liều đầu, số cữ bỏ và thời hạn mặc định.
- Không có liều tương lai thì từ chối hoặc mở luồng riêng rõ ràng; recheck với now nhất quán trong transaction, kể cả qua 00:00.
- Giữ CAS, affectedRows và 409 DOSE_CHANGED; refresh sau 409, không tự retry.
- Muộn/bổ sung ngày cũ giữ API, lý do, thời hạn và audit riêng; không biến ghi nhận thành chỉ dẫn uống thêm.
- Chốt ngừng đơn khác ngừng chọn danh mục; cảnh báo chồng đơn theo nghiệp vụ, không cấm mọi thuốc giống nhau.

### Lịch khám

- Đặt mới kiểm cả ngày và giờ; lịch sử tách luồng có chủ đích.
- Sửa/hủy/kết quả kiểm lại trạng thái ở SQL cuối, không chỉ SELECT trước.
- Notification/reminder chỉ thay khi mutation thành công; giữ clock key của reminder cho lần dời thực sự.
- Không cấm máy móc mọi lịch trùng nếu có nhiều chuyên khoa; có thể cảnh báo để xác nhận sau khi chốt policy.

### Hồ sơ, quyền và phiên

- Backend validator dùng chung: tên bắt buộc; DOB thật/không tương lai; Nam/Nữ/Khác; SĐT 10 số bắt đầu 0; CCCD 12 số nếu có; max length theo cột.
- Partial update không null hóa trường vắng; trường bắt buộc đăng ký/account khác trường tùy chọn của hồ sơ.
- Chốt phone liên hệ/login và tên hồ sơ/account; kiểm tra unique ở mọi đường ghi.
- Kiểm user, role, scope và consent hiện hành; projection ở Backend, không chỉ ẩn nút.
- Đổi phiên invalidate pending request/listener/cache; socket expiry/revocation tương đương HTTP.
- GoogleSubject chỉ liên kết sau chứng minh sở hữu, không ghép email.

### SOS

- Giữ đủ 3 giây liên tục trong phiên tương tác còn hiệu lực; hủy khi nhả, background, rời route hoặc mất focus.
- Pending/error/uncertain/confirmed tách biệt; không tự retry sau timeout/reconnect.
- GPS freshness/accuracy cần policy rõ; không có vị trí phù hợp thì gửi không GPS.
- Tắt chuông độc lập xử lý SOS; chỉ SOS hợp lệ phát âm thanh, chống trùng nhiều tab.
- Không dùng main để tạo cấp cứu giả hoặc nghiệm thu ghi dữ liệu.

## 10. Khác biệt Web–Mobile

| Luồng | Web | Mobile | Tác động |
| --- | --- | --- | --- |
| BP | Own API cho phép BP riêng | Detail form bắt kèm HR | UX và khả năng ghi nhận khác nhau |
| BP/HR validation | Theo Backend ở luồng liên quan | Local bounds khác | Số Web nhận nhưng Mobile chặn |
| Form số đo | Theo modal nhập | Controller sống cùng screen | Carry-over giữa type/bản ghi mới |
| SOS lifecycle | Safety controller có cancel/invalidation trong suite | SosScreen chưa invalidate theo lifecycle | AUD-10; Android cần xác minh |
| GPS | Web kiểm đồng ý/freshness | Last-known không age/accuracy guard | AUD-09 |
| AI history | RAM theo workspace/phiên | Secure storage theo API/account/profile | Có chủ đích; không hứa đồng bộ |
| Ngày liều | Backend chốt Việt Nam | Một số today dùng device | Cần kiểm thử đổi zone |
| Refresh | Hooks revisions/abort/session | Socket, cache generation, foreground refresh | Offline không tức thời |
| Người thân | Portal chỉ đọc, purge/recheck | Chưa có Mobile Người thân | Không tự mở role |

## 11. Kiểm thử đã thực sự chạy

| Nhóm | Kết quả | Giới hạn |
| --- | --- | --- |
| Backend toàn suite | **467 PASS, 0 FAIL, 2 SKIP / 469** | Preload chặn SQL/live/provider; hai SQL opt-in SKIP |
| SQL Stage6 thuốc | **17 PASS, 0 FAIL** | Hai pool thật, routes/JWT/scope thật, socket stub; repeat/race/supplement/role |
| SQL Stage6 lịch khám | **Tái hiện AUD-07** | Cancel 200/Huy; stale update 200/ChuaDen; không phải business PASS |
| SQL catalog/predicate/time | **PASS đọc và đối chiếu** | SELECT metadata/VALUES, không phải E2E notification |
| SQL → report handler → dayjs | **PASS mẫu** | NCT fixture 1, 26/10 23:55 cùng giờ/ngày; không kiểm mọi zone/browser |
| Flutter toàn suite | **485 PASS, 0 FAIL** | Unit/widget với transport fixture, không phải Emulator |
| Flutter analyze --no-pub | **PASS** | No issues found |
| Audit health widget | **4/4 ca chứng minh/đối chiếu đạt** | Carry-over, partial retry, mapping BP/HR, local chặn 290; không nghĩa lỗi đã sửa |
| Audit SOS widget | **2/2 ca tái hiện đạt** | Stale GPS/lifecycle, không gửi ra mạng |
| Audit Socket.IO | **Tái hiện AUD-01** | Server/client thật, account/JWT giả, không SQL |
| Audit handler | **Tái hiện AUD-06/08/12** | SQL mock; không commit main |
| Frontend toàn suite | **351 PASS, 2 FAIL / 353** | Một child design-dose-form-large 360px và một parent suite FAIL |
| Chrome chạy lại ca FAIL | **5 PASS, 0 FAIL** | Bốn width 360/768/1024/1440 + parent; không xóa FAIL lượt toàn suite |
| Production build | **PASS** | Warning chunk lớn, JS chính khoảng 2.043 KB trước gzip |
| Lint | **PASS, 10 warnings, 0 errors** | React effects/Fast Refresh sẵn có |
| git diff --check | **PASS** | Kiểm hash baseline riêng |
| Chrome phiên người dùng/provider thật | **NOT_RUN** | Đã chạy Chrome headless fixture, không dùng phiên người dùng thật |
| Android/GPS native/loa vật lý | **NOT_RUN** | adb không có device |

Frontend FAIL: assertion **“180% modal submit fits width and is reachable without a write”** tại frontend/test/elderlyWorkspace.browser.test.js:242, fixture:192. Chạy riêng lại PASS, ghi R-07; không sửa CSS hoặc tuyên bố toàn frontend xanh.

Một số lần viết harness tạm ban đầu bị SnackBar che hoặc chưa đợi async xong. Đã sửa cách chờ/kiểm tra của harness và chạy lại; không dùng tap không hit-test được để kết luận bug production. Mapping BP/HR cuối cùng đã PASS bằng fixture có ID đúng.

### Hồi quy tích cực

- /confirm và /status: repeat DaUong, DaUong → BoLo/TuChoi, cùng/khác state cạnh tranh, cross-endpoint; request cũ 409, không ghi đè thời gian.
- BoLo/TuChoi hôm nay → DaUong hợp lệ còn hoạt động.
- Ngày cũ/tương lai bị chặn ở confirm trực tiếp; supplement có một audit, request lặp xung đột.
- Admin/CG phân công/NCT own được phép; Người thân/NCT khác bị chặn trong SQL test.
- Fixture Web phủ bốn role, session/account switch, own resources, Google challenge/link, AI/SOS/notifications.
- Timezone/SLA fixed clock: timestamp không hợp lệ không bị ép 0; SQL 27/10 13:05 → 06:05Z, 23:55 → 16:55Z; không sửa lịch sử.
- Report mẫu SQL thật giữ 23:55 cùng ngày.
- Mobile local reminder có repeat 5 phút và cancel trạng thái hoàn tất trong plan/source/tests; native/offline chưa xác minh.
- AI tools chỉ scoped SELECT/actions whitelist; không có tool gửi SOS/xác nhận thuốc.
- Google Web theo sub, nonce/cookie/origin/challenge single-use/reauth; không ghép email. Google provider thật NOT_RUN.

Không cộng tất cả test thành một con số “nghiệp vụ an toàn”: có testcase lồng parent/child và test đang chứng minh bug.

## 12. Bằng chứng và lệnh

Thư mục ngoài repo:

**C:/Users/Admin/AppData/Local/Temp/caresenior-business-audit-66d15f13012c4146b9b76b9e95c7006e**

| File | Mục đích |
| --- | --- |
| source-before.json, git-before.txt | SHA-256/Git baseline |
| backend-tests.log, frontend-tests.log | Full suite, giữ FAIL frontend |
| flutter-tests.log, flutter-analyze.log | 485 tests và analyze |
| health_audit_test.dart, health-audit.log | Bốn widget cases, dùng fixture không sửa source |
| sos_audit_test.dart, sos-audit.log | GPS/lifecycle |
| socket-audit.cjs, socket-audit.log | Socket expired/disabled |
| backend-audit.cjs, backend-audit.log | Fixed clock zero-dose/past appointment |
| profile-audit.cjs, profile-audit.log | Phone profile/account |
| medication-sql-evidence.json, medication-sql.log | Guards, SQL checks, IDs 47–64 |
| appointment-race-audit.cjs, appointment-race.log | ID 4, race và trạng thái cuối |
| sql-readonly-evidence.json, stage6-schema.json | Catalog/predicate/schema Stage6 |
| main-catalog-readonly.cjs, main-catalog-readonly.json | SELECT main, 24 bảng/4 role/index |
| report-time-audit.cjs, report-time-audit.log | Report handler SQL thật, không persist write |
| frontend-targeted.log | Rerun modal 1,8× |
| frontend-build.log, frontend-lint.log | Build/lint warnings |

Chrome evidence:

- Full suite: C:/Users/Admin/AppData/Local/Temp/caresenior-elderly-web-08PTU5
- [Ảnh ca modal 360px, chữ 1,8×](C:/Users/Admin/AppData/Local/Temp/caresenior-elderly-web-08PTU5/design-dose-form-large-360.png)
- Rerun: C:/Users/Admin/AppData/Local/Temp/caresenior-elderly-web-6vvUC3

File tạm có thể bị Windows dọn; testcase và số liệu chính đã ghi trong báo cáo. Không có mật khẩu/token/JWT người dùng thật trong báo cáo.

Lệnh chính đã chạy:

~~~
# server: preload chặn network/live, không bật relative SQL tạo DB
node --test test/*.test.js

# Chỉ với guards Stage6 và socket/mailer stub:
# CARESENIOR_MEDICATION_STAGE6=1
node --test test/medication-status-stage6.integration.test.js

# frontend: Chrome RAM API trên origin/port riêng, không .env backend
node --test test/*.test.js
npm run build
npm run lint

# mobile
flutter analyze --no-pub
flutter test --no-pub

git diff --check
git status --short
~~~

Không bật CARESENIOR_RELATIVES_SQL_TEST: test đó tự tạo database mới, trái phạm vi. Không đổi tên database trong script để chạy trên main. Chạy lại SQL ghi sẽ tạo thêm liều giả Stage6, cần kiểm soát.

## 13. Kế hoạch sửa từng đợt — CHỜ PHÊ DUYỆT

### Đợt 1: CRITICAL/HIGH và dữ liệu

1. AUD-01: socket hết hạn/khóa.
2. AUD-07: CAS lịch khám; hủy không bị stale edit khôi phục.
3. AUD-04/AUD-03: carry-over và partial BP-HR.
4. AUD-09/AUD-10: GPS/hold Mobile; cần duyệt sửa Flutter riêng.
5. Xác minh R-01/R-10 trước mở rộng transaction/idempotency.

| Nhóm | File dự kiến sửa/tạo test | Regression/tác động |
| --- | --- | --- |
| Socket | server/src/socket.js; nguoiDung.controller.js chỉ nếu cần thu hồi; tests socket/auth | Bốn role, reconnect, nhiều tab, health/SOS |
| Appointments | server/src/controllers/lichKhamBenh.controller.js; concurrency tests | Cancel/edit/result, notification, scope, 409 |
| Mobile health | mobile/lib/screens/health/health_detail_screen.dart; health_dashboard_ui.dart nếu cần; widget tests | Add/retry/draft/type/account |
| Mobile SOS | mobile/lib/screens/alerts/sos_screen.dart; alerts fixture/tests | Lifecycle, pointer cancel, GPS/no GPS, timeout |

Ưu tiên thay đổi tối thiểu; không cần sửa schema chỉ để dùng CAS. API batch/contract mới phải trình duyệt riêng.

### Đợt 2: Form, validation và Web–Mobile

- AUD-02/05: BP/HR thống nhất theo policy đã duyệt.
- AUD-06/08: datetime/zero-dose/preview.
- AUD-11: trạng thái đủ điều kiện nhắc khám.
- AUD-12/15: nghĩa phone/name, unique mọi đường ghi; index cần kiểm tra dữ liệu và phê duyệt DB riêng.
- AUD-14: thời điểm đo khác thời điểm cảnh báo.

File dự kiến:

- donThuoc.controller.js; frontend/src/pages/MedicationSchedule/MedicationSchedulePage.jsx; medicationScheduleRules.js.
- lichKhamBenh.controller.js; AppointmentsPage.jsx nếu cần lỗi field.
- appointmentReminder.service.js.
- hoSoNguoiCaoTuoi.controller.js; nguoiDung.controller.js; auth.controller.js; các profile adapter liên quan.
- chiSoSucKhoe.controller.js và consumers event thật.
- HealthMetricValidation và client constants chỉ tái sử dụng quy tắc đã duyệt, không đổi ngưỡng.
- Regression tests tương ứng; không sửa Google/AI/SOS ngoài phạm vi.

### Đợt 3: UX, thông báo và lỗi nhỏ

- AUD-13: nhãn trung tính khi chưa cấu hình.
- Điều tra R-07 bằng Chrome tương tác trước sửa layout.
- Thông điệp partial save/timeout/conflict, giữ draft và focus lỗi.
- Chữ 1,8×/keyboard; chỉ chỉnh layout khi lỗi tái hiện ổn định.
- Lint warnings/bundle size là nợ kỹ thuật, không tự rewrite.

### Gate nghiệm thu mỗi đợt

- Biến testcase chứng minh bug thành regression khẳng định hành vi mong muốn.
- Chạy Backend/Frontend/Flutter phù hợp và SQL Stage6 cạnh tranh.
- Bảo toàn DOSE_CHANGED, timezone/SLA, quyền Người thân, Google, AI.
- GPS/lifecycle/SOS cần Android thật sau sửa; không đóng lỗi chỉ từ source.
- Không triển khai main/patch hoặc gửi SOS thật.

## 14. Checklist thủ công còn lại

Chỉ dùng fixture/Stage6 cho thao tác ghi:

1. Bốn role trên Chrome: login, refresh, đổi tab/account, logout; không còn dữ liệu cũ.
2. Khóa account test khi Web mở, chờ JWT hết hạn; sau sửa AUD-01 không nhận dữ liệu mới.
3. Mobile BP thiếu HR, lỗi bước cuối, retry; lịch sử không nhân bản.
4. HR 85 → type mới; đóng/mở/success/fail; reset đúng lúc, giữ draft khi lỗi.
5. Hai phiên hủy/dời cùng lịch: lịch Huy không sống lại, stale request 409.
6. SOS nhả sớm, inactive, khóa màn, notification shade, rời màn; GPS denied/current lỗi/last-known cũ; không gửi thật.
7. Chuông Chrome: thao tác bật, autoplay block, nhiều tab, tắt chuông, thu hồi liên kết; nghe loa trực tiếp.
8. 360px/1,8×, modal thuốc tên dài: cuộn đến submit, keyboard; không bị che/cắt.
9. Google account test: linked sub/link password/email trùng; không gửi secret qua chat.
10. AI provider được phép: HEALTH tự nhiên/APP đúng own API/out-of-scope; không tự ghi.
11. Phone profile/account/duplicate chỉ Stage6; thông điệp rõ, password login giữ đúng.
12. Offline/reconnect Web–Mobile và reminder reconcile; không hứa đồng bộ khi offline.

## 15. Sẵn sàng demo

- Có thể trình bày các luồng đã kiểm thử **trong môi trường cách ly, có giám sát và nêu giới hạn**.
- **Chưa nghiệm thu demo cuối là “nghiệp vụ hoàn chỉnh/an toàn”** khi còn AUD-01,03,04,07 và vấn đề SOS Mobile.
- 485 Flutter PASS không phủ định lỗi đã tái hiện. Frontend full suite có FAIL chập chờn, không tuyên bố toàn bộ xanh.
- Audit không ghi main, không ghi/xóa bốn fixture cũ; Stage6 giữ dữ liệu giả để đối chiếu.
- Chỉ tạo báo cáo; chưa thực hiện đợt sửa nào. **Dừng để người dùng phê duyệt bước tiếp theo.**


## 16. Đối chiếu Git sau audit

- SHA-256: 624 file baseline còn nguyên, 0 file bị sửa hoặc mất.
- git diff --name-only không có tracked file thay đổi.
- git status --short: mobile/design_reference/ chưa theo dõi từ trước; reports/ là phần bổ sung của audit.
- File mới duy nhất trong repo do lượt này tạo: reports/BUSINESS_LOGIC_AUDIT.md.
- git diff --check cho tracked files và kiểm tra no-index riêng cho báo cáo mới: PASS.
- Các link file cục bộ trong báo cáo đã được kiểm tra tồn tại.
- Không stage, commit, push, reset hoặc clean Git.
