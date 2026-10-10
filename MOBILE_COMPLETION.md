# Hoàn thiện mobile và chatbot

## Chatbot hướng dẫn trước khám — bản cập nhật mới nhất 10/10/2026

Nguyên nhân: detectIntent bắt mọi câu chứa “khám” thành appointments; Groq bị ép gọi công cụ. Nếu tool generation lỗi, fallback vẫn tra lịch nên trả “Chưa có lịch khám” cho một câu hỏi hướng dẫn. Đã tách visit_preparation/visit_fasting, trả lời trực tiếp không cần công cụ/lịch cá nhân; thêm hướng dẫn cục bộ an toàn và thông báo dự phòng đúng loại câu hỏi.

Kết quả API thật cổng 5000 qua Dio trong app Android: trước sửa tái hiện AI_TOOL_GENERATION_FAILED và lịch rỗng ở chat mới, lịch rỗng sau chủ đề lịch khám. Sau sửa, chat mới/sau chủ đề lịch khám trả AI hướng dẫn chuẩn bị có BHYT, không trả lịch rỗng. Câu nhịn ăn từng đạt AI hỏi lại; lượt cuối Groq HTTP 200 bị chặn ở output_validation với AI_UNSAFE_OUTPUT và trả đúng hướng dẫn chung hỏi loại khám/xét nghiệm. Một lỗi provider tạm thời trước đó cũng fallback đúng hướng dẫn. HTTP Groq của lỗi cũ không được lưu; không suy đoán mã 400. Response mới ghi mã HTTP/provider/bước/loại lỗi an toàn, không log raw message hay dữ liệu riêng tư.

Regression: **143/143 backend**, **62/62 Flutter**, analyze **No issues found**. Có dấu/không dấu, có/không lịch, không hồ sơ, sau lịch/context cũ, timeout, thiếu cấu hình, quota không retry, hướng dẫn nhịn ăn sai và giữ nhãn thật. Các test này dùng mock; API/Groq thật là lượt xác minh riêng.

Đã build/cài/chạy lại với Flutter trên **23129RAA4G / 51330c42**, Android 15, API 127.0.0.1:5000/api. Phiên debug kết nối, tiến trình còn chạy, không thấy fatal/unhandled trong log kiểm tra. APK giữ riêng **mobile/build/app/outputs/flutter-apk/app-visit-preparation-debug.apk**, 157.171.009 byte, SHA256 **2E642A7A7151F711407E5F8D86E52E2D10B093B066AD27D431CB6BAC92C891E4**. APK trước giữ nguyên. Điện thoại có lúc khóa màn hình; kiểm tra câu trả lời qua API trong isolate thật, không tuyên bố đã gõ toàn bộ kịch bản qua UI.

File bước này: server/src/services/careAssistant.context.js, careAssistant.service.js, careAssistant.ai.js; server/src/controllers/careAssistant.controller.js; server/test/visit-preparation.test.js; mobile/lib/models/care_assistant.dart; mobile/test/visit_preparation_test.dart; mobile/CARE_ASSISTANT.md và báo cáo này. Script probe/log trong mobile/build bị Git ignore, không chứa khóa/token/raw hồ sơ. Không sửa .env, không ghi database app, không reset/commit/push. Lệnh chạy lại USB từ gốc repository: `powershell -ExecutionPolicy Bypass -File mobile/tools/run_android_usb.ps1 -DeviceId 51330c42`.

## Kiểm tra điện thoại USB — mới nhất 10/10/2026

- Thiết bị thật **23129RAA4G**, ID **51330c42**, Android 15/API 35, android-arm64 đã được Flutter/adb nhận diện. Các ghi chú “chưa có Android” bên dưới phản ánh các lượt kiểm tra trước.
- Xác minh lỗi aapt 36.1.0: APK gốc tồn tại nhưng không đọc được khi đường dẫn Windows có dấu. Cùng file chép sang đường dẫn ASCII đọc manifest thành công. Không thiếu Manifest; không chạy flutter create, không thay SDK/Gradle/dependency.
- Đồng bộ source chưa commit sang bản sao ASCII có sẵn `C:\Users\MINH\AppData\Local\Temp\elderly-defense-20261010`, chạy `flutter run -d 51330c42 --dart-define=API_BASE_URL=http://127.0.0.1:5000/api`. Build/cài/mở app thành công và có phiên debug Dart VM Service, không phải phương án chỉ adb install.
- Backend hiện có cổng 5000 trả HTTP 200; thiết lập reverse riêng cho thiết bị. Xác minh URL compile trong isolate Flutter và thực hiện GET không xác thực, chỉ đọc từ Dio của tiến trình Flutter: HTTP 200. Không đọc token, không gửi mật khẩu hoặc dữ liệu hồ sơ.
- Sau mở khóa, UI hiển thị app và nội dung màn hình đăng nhập. Tiến trình giữ nguyên, không thấy FATAL EXCEPTION, Unhandled Exception hoặc ERROR:flutter trong cửa sổ log kiểm tra. Có cảnh báo GPU/vendor và chậm frame lúc khởi động, không gây crash trong lượt này.
- APK lưu riêng **mobile/build/app/outputs/flutter-apk/app-usb-device-debug.apk**, 157.171.009 byte, Android arm64, API 127.0.0.1:5000/api. Không ghi đè các APK app-backend, app-sql-test hay app-defense.
- Chưa kiểm tra đăng nhập tài khoản thật, nhật ký/cảnh báo/chatbot sau đăng nhập trên điện thoại; không SOS, sửa hồ sơ hoặc ghi database app. Không gỡ app, không xóa dữ liệu điện thoại; không reset/commit/push.
- File bổ sung trong bước này: `mobile/tools/run_android_usb.ps1`; cập nhật RUN_GUIDE.md và báo cáo này. Script đã kiểm tra cú pháp PowerShell; phiên chạy thực tế sử dụng lệnh trực tiếp trên bản sao ASCII nêu trên, không tuyên bố đã chạy toàn bộ script mới.

## Bổ sung khoảng trống — kết quả mới nhất 10/10/2026

Phần này thay thế các giới hạn về sửa/xóa nhật ký, xử lý SOS và kiểm tra Groq trong báo cáo cũ bên dưới. Giữ nguyên thay đổi chưa commit trên nhánh minh; không sửa .env, không migration/schema hoặc ghi dữ liệu vào database app, không reset/commit/push.

### Các luồng vừa hoàn thiện

- SOS: `PATCH /api/emergency-alerts/:id/seen` và `/resolve`; dùng chung transaction với các API `/alerts/:id/seen|resolve`. Hai bảng CanhBao và CanhBaoKhanCap cùng chuyển trạng thái, cùng lưu tài khoản/thời điểm xử lý. Thứ tự là tiếp nhận rồi xử lý; thao tác lặp hoặc chuyển sai trả 409. Transaction khóa bản ghi và kiểm tra lại tài khoản, quyền, phân công đang hiệu lực; caregiver ngoài phạm vi trả 403. BIT false/0 không cấp quyền.
- SOS cũ chưa có CanhBao vẫn xuất hiện trên mobile từ dữ liệu SOS thật. Khi người có quyền tiếp nhận, backend tạo bản ghi liên quan trong cùng transaction, giữ nguyên ID và lịch sử SOS. Thao tác bị từ chối không để lại bản ghi mới; không backfill database app. Kiểm tra chỉ đọc database app thấy một SOS chưa liên kết, không sửa bản ghi đó.
- Nhật ký: `PATCH /api/care-notes/:id` sửa nội dung; `DELETE /api/care-notes/:id` xóa mềm bằng TrangThai=HUY đã có trong schema. Chỉ người tạo đang được phân công hoặc Admin được sửa/xóa. Version tính từ dữ liệu hiện có ngăn ghi đè thay đổi đồng thời; không thêm cột. Danh sách mobile và công cụ chatbot loại bỏ nhật ký đã hủy.
- Mobile: có nút sửa/xóa theo quyền từ backend, xác nhận trước xóa, khóa thao tác lặp, giữ nháp/hộp thoại khi lỗi và bỏ phản hồi phiên cũ. Khi 409, giữ nháp; cần đọc lại bản ghi mới trước khi lưu lại, không gửi lặp version cũ. Banner SOS cập nhật theo trạng thái vừa tải thay vì dữ liệu đầu vào cũ.

### Bằng chứng và môi trường

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| Backend tests | 132/132 pass | Mock; không gọi AI thật |
| Flutter tests | 60/60 pass | Widget/service mock, có sửa/xóa và giữ nháp khi lỗi |
| Flutter analyze | No issues found | Source mobile hiện tại |
| API ghi và đối chiếu SQL | PASS_SQL_EDIT_SOFT_DELETE_SOS_SYNC_ROLLBACK_RACE | Express và SQL Server thật, database riêng chỉ chứa dữ liệu giả |
| Flutter Web + SQL | SQL_CONFIRMED_EDIT_SOFT_DELETE_SOS_RESOLVE | UI thật trong Chrome; tạo/sửa/xóa nhật ký, gửi/tiếp nhận/xử lý SOS và các thao tác ghi cũ |
| Groq SDK thật | OK_SYNTHETIC_TOOLS_AND_FOLLOWUP | Một lượt script, hai request cho dữ liệu lịch khám giả lập; không đọc hồ sơ app |
| Backend app | HTTP 200, pool SQL kết nối; OPTIONS auth 204 | Cổng 5000, chỉ kiểm tra kết nối; không thao tác ghi hồ sơ thật |
| Android | Build hai APK thành công | Không có điện thoại/emulator; chưa kiểm tra chạy trên Android |

Database kiểm thử hiện tại: **CareAssistant_Test_1791618532545_240159**. Script kiểm tra tên/đặc điểm fixture trước khi ghi. Kiểm thử gồm phân công thu hồi, sai vai trò/khác tác giả, version cũ, chuyển trạng thái sai, hai request đồng thời, SOS cũ thiếu bản ghi liên quan và lỗi SQL buộc rollback. Trigger gây lỗi chỉ được tạo rồi gỡ trong database kiểm thử; không tạo trên app. Không cần migration vì schema hiện có đủ trạng thái và cột người/thời điểm xử lý.

Kiểm tra Groq thật khác với test mock và khác với thao tác UI: đã xác minh SDK/tool calling/câu tiếp nối bằng dữ liệu giả, chưa xác minh chatbot trên điện thoại. Không retry quota liên tục, không đổi provider/billing. Các công cụ AI vẫn chỉ đọc; AI không tự gửi SOS hay sửa nhật ký.

### APK hiện tại

| APK trong mobile/build/app/outputs/flutter-apk | API compile | Mục đích |
|---|---|---|
| app-backend-debug.apk | http://127.0.0.1:5000/api | Backend app dùng SQL thật; USB cần adb reverse cổng 5000 |
| app-sql-test-debug.apk | http://127.0.0.1:5059/api | Source mới với backend SQL kiểm thử; chỉ dữ liệu giả |
| app-defense-debug.apk | http://127.0.0.1:5059/api | APK kiểm thử cũ, giữ nguyên; chưa có sửa/xóa nhật ký mới |

SHA256 bản backend: **907994E19B6B0320937844D93424B9D5BC18EDFE5F544EF2E33E30FFD4076CD6**, 180.020.775 byte.

SHA256 bản SQL kiểm thử mới: **218C9F358168CC068ECDEA9C26662FF95F2816D83EB0EC42B294AA752968BB37**, 180.019.462 byte.

SHA256 bản kiểm thử cũ giữ nguyên: **D7579AC49901CC7E203D34FBACEDC0C95F63E124F4933D4972CC261C34BB6BC3**. Ba bản có cùng applicationId; cài bản khác thay thế ứng dụng, cần đăng xuất khi đổi backend. Build dùng bản sao source đường dẫn ASCII và thư mục build riêng; không ghi đè APK cũ.

### File liên quan trong bước bổ sung

- Backend: controllers canhBao, emergencyAlert, mobileProfile, nhatKyChamSoc; routes emergencyAlert và nhatKyChamSoc; services mới alertWorkflow và careNoteMutation; careAssistant.repository lọc nhật ký hủy.
- Mobile: caregiver_elderly_detail_screen, caregiver_dashboard_service, care_notes_screen, care_notes_service; widget mới delete_care_note_dialog.
- Kiểm thử: mobile-write-workflows.test.js, care_notes_test.dart; scripts verify_mobile_flows.js và verify_mobile_ui_flow.js.
- Bàn giao: RUN_GUIDE.md, DEMO_GUIDE.md, MOBILE_COMPLETION.md, mobile/CARE_ASSISTANT.md. Các thay đổi của bước trước được giữ nguyên.

Chạy demo hai vai trò với database kiểm thử và APK app-sql-test-debug.apk theo [DEMO_GUIDE.md](DEMO_GUIDE.md). Bản app-backend-debug.apk kết nối dữ liệu app: không dùng tài khoản/hồ sơ người thật để thử SOS. Lệnh và thư mục chạy nằm trong [RUN_GUIDE.md](RUN_GUIDE.md). Chưa xác minh USB/Wi-Fi, bàn phím/back hoặc notification nền trên Android; không có bằng chứng FCM/SMS. Groq có thể bị quota và sẽ dự phòng rõ chế độ.

## Lịch sử: kiểm tra trước bước bổ sung, 10/10/2026

Phần này là kết quả chạy lại trên source hiện tại của nhánh minh; báo cáo 09/10 bên dưới được giữ như lịch sử, không dùng thay bằng chứng mới. Không tìm thấy AGENTS.md trong project. Đã đọc CARE_ASSISTANT.md và đối chiếu code/API/schema. Không sửa .env, schema/database app, không reset/clean/merge/commit/push.

### Lỗi sửa và chức năng hoàn thiện

- Splash: đọc token nằm trong khối xử lý lỗi; lỗi đọc phiên không còn làm khôi phục phiên treo mà không có phản hồi. Lỗi mạng giữ phiên và cho thử lại.
- Caregiver: thêm màn hình nhật ký đọc/tạo từ API care-notes đã có, gắn đúng hồ sơ đang mở; không thêm API sửa/xóa. Form giữ nháp khi lỗi, khóa gửi trùng/back khi đang lưu, chặn phản hồi của phiên/hồ sơ cũ.
- Nhật ký backend: kiểm tra phạm vi hồ sơ, loại/độ dài nội dung; lấy caregiver từ tài khoản xác thực. Ngày/giờ SQL xuất dạng wall time Việt Nam, không phụ thuộc timezone máy Node; ghi giờ UTC+7.
- Cảnh báo: bỏ lần tải lại không được bắt lỗi trong nhánh lỗi mạng; giữ nháp kết quả xử lý khi mở lại hộp thoại. Hộp thoại cuộn với chữ lớn/bàn phím. Trạng thái được cập nhật khi API ghi thành công; lỗi tải lại sau đó được báo riêng, không giả báo thao tác ghi thất bại.
- Backend xử lý cảnh báo: từ chối ghi chú sai kiểu/quá 500 ký tự thay vì chuyển object thành chuỗi hoặc bị cắt nội dung; ghi thời gian xử lý UTC+7.
- Fixture: --fixture-only tạo database mới theo ngày hiện tại, chỉ DDL và dữ liệu giả; không truy cập database app. Script kiểm tra thêm danh tính caregiver/người nhận, journal/alerts/token/context và đối chiếu SQL.

### Môi trường và bằng chứng mới

- Node 24; Flutter 3.38.5, Dart 3.10.4; Android SDK 36.1, Java 21. flutter devices chỉ có Windows/Chrome/Edge, không có Android/emulator. Một số Android licenses chưa chấp nhận, nhưng build với SDK đã cài chạy được.
- Database mới: **CareAssistant_Test_1791616066840_ccaf36**, giữ lại để kiểm tra. Hai hồ sơ TEST ONLY A/B, một caregiver giả số 0000000000, ba tài khoản test.elder.a/b và test.caregiver. Mật khẩu/JWT sinh trong bộ nhớ, không in ra hoặc lưu tài liệu.
- API thật: Express/JWT/SQL Server tại 127.0.0.1:5059; không mock SQL, không gửi SOS tới người thật, không gọi điện/SMS/AI.
- UI thật: Flutter Web biên dịch, Chrome headless, cổng 5039 proxy API 5059; không giả lập response. Chụp màn hình trong mobile/build/; chỉ dữ liệu giả. Đây không phải kiểm tra Android.
- Mock: **backend 121/121**, **Flutter 57/57**; flutter analyze toàn bộ project **No issues found**. Test AI không gọi dịch vụ thật.

| Luồng | Kết quả trong lượt này | Loại bằng chứng |
|---|---|---|
| Đăng nhập hai vai trò, đăng xuất, đổi tài khoản | Đạt; vào đúng trang và dữ liệu đúng vai trò | HTTP/SQL và UI Web thật |
| Khôi phục phiên đúng vai trò | Đạt test caregiver từ phiên lưu; hardening lỗi đọc token | Widget mock và đọc code; chưa cold start Android |
| Token hết hạn và phản hồi phiên cũ | API trả 401; client xóa token/user; 200/401 cũ không ảnh hưởng tài khoản mới | HTTP thật và interceptor test mock |
| Trang chủ, thuốc, lịch khám, sức khỏe, người chăm sóc, hồ sơ | Đọc đúng phạm vi; UI mở/quay lại được | API SQL và UI Web thật |
| Xác nhận thuốc, đọc thông báo, sửa hồ sơ | Đạt, đối chiếu trực tiếp SQL; đầu vào lỗi không ghi địa chỉ mới | API, UI Web, SQL |
| Caregiver A/B và assignment hết hạn | Chuyển đúng A/B; assignment bị thu hồi trả 403 | API thật và UI Web thật |
| Nhật ký tạo/đọc | Ghi đúng A + caregiver, thời gian khớp SQL; B không thấy nhật ký A | API/SQL, UI Web, mock lỗi/nháp/gửi trùng |
| Cảnh báo thường tiếp nhận/xử lý | Trạng thái/handler/ghi chú lưu SQL; xử lý lại bị từ chối; lỗi mạng không mất nháp | API SQL thật, UI widget mock |
| SOS và thông báo người nhận | Ghi SOS A, notification tới UserID caregiver giả, B không thấy SOS A | API/SQL và UI Web gửi SOS thật trong DB giả |
| Chatbot tiếp nối/đổi chủ đề/đổi hồ sơ | Lịch khám → còn mấy ngày → thuốc khớp hàng dữ liệu nguồn; context A sang B bị 400 | API thật ở mode functional và test mock AI |
| Chữ lớn, nhỏ, bàn phím, back, offline | Đạt test liên quan; sửa lỗi overflow ở nhật ký | Widget mock; UI Web có thao tác quay lại và giả lập viewport |

### APK và cách chạy

- APK cuối: **mobile/build/app/outputs/flutter-apk/app-defense-debug.apk** (debug, ignored bởi Git).
- Dung lượng 180.013.578 byte; SHA256: D7579AC49901CC7E203D34FBACEDC0C95F63E124F4933D4972CC261C34BB6BC3. Build lại sau bản sửa cuối, không dùng APK của báo cáo 09/10.
- URL compile: **http://127.0.0.1:5059/api**. Dùng server database giả lập và adb reverse tcp:5059 tcp:5059. Wi-Fi cần build/run lại bằng IP LAN; không dùng APK localhost trực tiếp.
- Source được copy sang đường dẫn ASCII trong TEMP để tránh lỗi Gradle đường dẫn có dấu; thư mục build junction sang ổ D của project. Không đổi source hoặc xóa build cũ.
- Xem [RUN_GUIDE.md](RUN_GUIDE.md) cho lệnh, thư mục chạy, cấu hình .env riêng và cách USB/Wi-Fi/Web; [DEMO_GUIDE.md](DEMO_GUIDE.md) cho kịch bản hai vai trò khoảng 7 phút.

### Chưa xác minh / giới hạn

- Không có điện thoại/emulator: chưa xác minh thao tác trên Android, USB/Wi-Fi thực tế, bàn phím/back Android, cuộc gọi, notification nền/permission nhắc thuốc. Build thành công chỉ chứng minh biên dịch.
- Không gọi Groq thật trong lượt này; quota/chất lượng kết nối AI hiện tại chưa xác minh. Lỗi/timeout/quota/injection/an toàn không ghi dữ liệu được kiểm tra bằng mock; API giả lập dùng fallback rõ chế độ.
- CanhBaoKhanCap chưa có endpoint thay đổi trạng thái SOS. Cảnh báo thường trong CanhBao có API xử lý; không coi việc xử lý cảnh báo thường là đã xử lý trạng thái SOS riêng.
- Nhật ký chưa có endpoint sửa/xóa; hoàn thiện tạo/đọc và không tự mở rộng schema/API ngoài chức năng sẵn có.
- Thông báo SOS hiện là in-app SQL/API; không có bằng chứng SMS/FCM hoặc push khi app bị đóng. Không tuyên bố đây là hệ thống cứu hộ thực tế.

### File thay đổi trong lượt này

- mobile/lib/main.dart
- mobile/lib/screens/caregiver/caregiver_elderly_detail_screen.dart
- mobile/lib/screens/caregiver/care_notes_screen.dart (mới)
- mobile/lib/services/care_notes_service.dart (mới)
- mobile/test/care_notes_test.dart (mới)
- mobile/test/session_lifecycle_test.dart (mới)
- mobile/test/caregiver_alert_test.dart (mới)
- server/src/controllers/nhatKyChamSoc.controller.js
- server/src/controllers/canhBao.controller.js
- server/scripts/verify_assistant_positive_api.js
- server/scripts/verify_mobile_flows.js
- server/scripts/verify_mobile_ui_flow.js
- MOBILE_COMPLETION.md, RUN_GUIDE.md (mới), DEMO_GUIDE.md (mới), mobile/CARE_ASSISTANT.md

---

## Bổ sung 09/10/2026: mobile ngoài chatbot, ưu tiên Android

### Thiết bị và APK

- `flutter devices` tìm thấy Windows, Chrome và Edge; **không có điện thoại Android hoặc emulator kết nối**. Chưa chạy trên máy Android thật.
- Đã build APK debug từ mã mobile cuối, cấu hình riêng `--dart-define=API_BASE_URL=http://127.0.0.1:5059/api`, không sửa `.env`.
- Artifact: [mobile/build/app/outputs/flutter-apk/app-debug.apk](mobile/build/app/outputs/flutter-apk/app-debug.apk), 179.977.981 byte. SHA256: `DF2395CEF8BC8579837E97325494DE963481841DF0B4E4FFD05F7A8CD57CF381`.
- Build tại đường dẫn project có dấu gặp `GradleWrapperMain`; build từ bản sao mobile ở đường dẫn ASCII thành công. Khi ổ C hết dung lượng, chuyển riêng thư mục build tạm của lượt này vào `mobile/build/android-isolated-build` trên ổ D và tạo junction từ bản sao ASCII. Không di chuyển/xóa source hoặc thay Gradle của project để xử lý vấn đề môi trường.

### Nguồn dữ liệu và cách kiểm tra

Chỉ dùng database kiểm thử riêng `CareAssistant_Test_1791560032538_c67e99` đã tạo ở lượt trước. Script kiểm tra tên database khác database app và xác minh đúng hai hồ sơ `TEST ONLY A/B`, CCCD `TEST-ONLY-A/B` trước khi ghi. Người chăm sóc và ba tài khoản `test.elder.a`, `test.elder.b`, `test.caregiver` đều là dữ liệu tổng hợp. Không đăng nhập, sửa hồ sơ hoặc gửi SOS ở database app; không chạy seed ghi đè. Database kiểm thử còn được giữ lại.

Fixture mobile bổ sung một số đo, thông báo TEST READ và đánh dấu assignment của A là người chăm sóc chính để kiểm tra đủ trường; tất cả chỉ ở database tổng hợp. Các kết quả chatbot bên dưới là snapshot trước những thao tác ghi mobile này.

- API thật: chạy toàn bộ Express, JWT, kiểm tra phạm vi và SQL Server trên tiến trình riêng `127.0.0.1:5059`. DB/JWT/cấu hình kiểm thử chỉ đặt trong bộ nhớ tiến trình.
- UI thật: Flutter Web đã biên dịch, chạy Chrome headless qua CDP; cổng `5039` phục vụ UI và chuyển request đến chính API kiểm thử `5059`. Có HTTP đọc/ghi và đối chiếu SQL; không thay backend bằng mock. CanvasKit được phục vụ từ SDK cục bộ khi output web thiếu thư mục engine.
- Widget test: adapter HTTP giả lập, dùng để kiểm tra dữ liệu rỗng, lỗi mạng, chữ lớn và phản hồi muộn. Không coi các test này là bằng chứng quyền truy cập hoặc ghi SQL.
- Các lượt chạy thử lặp lại có tạo thêm SOS/notification **chỉ trong database tổng hợp**. Mật khẩu test sinh ngẫu nhiên, token không xuất ra log/tài liệu. Không gọi AI, gọi điện, SMS hoặc dịch vụ gửi tin ngoài trong lượt này.

### Kết quả từng luồng

| Luồng | API/SQL thật | Giao diện Flutter Web | Android thật |
| --- | --- | --- | --- |
| Đăng nhập → trang chủ | Ba tài khoản test đăng nhập 200; nguồn hồ sơ/thuốc/sức khỏe/lịch/thông báo 200 | Đạt với người cao tuổi A | Chưa có thiết bị |
| Thuốc → xác nhận → quay lại | PATCH xác nhận 200; GET lại thấy `DaUong` và thời điểm thực tế | Chạm thuốc → chọn Đã uống; SQL xác nhận trạng thái/thời điểm đã lưu | Chưa thử nhắc thuốc nền/quyền Android |
| Lịch khám | API riêng trả mã trạng thái gốc, ngày giờ và địa điểm; lịch gần nhất đối chiếu truy vấn SQL độc lập | Mở lịch từ trang chủ, xem và quay lại; không còn 404/fallback | Chưa thử máy thật |
| Sức khỏe | Hồ sơ A có số đo giả lập 120/80 mmHg; B rỗng; truy vấn giữ đúng ID | Mở sức khỏe và quay lại; chi tiết người chăm sóc A hiển thị số đo A | Chưa thử máy thật |
| Thông báo → đọc | PATCH 200; GET/SQL lại có `DaDoc=true`; B đọc thông báo A bị 404 | Mở TEST READ, xem nội dung, đóng; SQL xác nhận đã đọc | Chưa thử push/thông báo hệ thống |
| Hồ sơ → chỉnh sửa → lưu | PUT hồ sơ đầy đủ/email 200; GET hồ sơ và `/auth/me` cùng email đã lưu | Nhập địa chỉ/email giả lập, lưu; SQL có `TEST UI ADDRESS` | Chưa thử bàn phím native |
| Email lỗi/trùng | Email sai hoặc dài hơn cột VARCHAR(100): 400; email tài khoản B: 409; địa chỉ A không đổi khi bị từ chối | Lỗi lưu 400 đã tái hiện trước sửa; sau sửa form lưu 200 | Chưa thử máy thật |
| SOS có xác nhận | POST 201; lưu SOS + cảnh báo + một thông báo cho tài khoản chăm sóc đang được phân công | Bấm Gửi cảnh báo SOS → Gửi SOS; SQL chỉ tăng thêm một SOS trong bước UI | Không gửi tới người thật |
| Đăng xuất → đăng nhập vai trò khác | Phiên mới dùng đúng user/role; cache phiên cũ được xóa | Người cao tuổi đăng xuất, người chăm sóc đăng nhập đúng màn hình Người tôi chăm sóc, sau đó đăng xuất | Chưa thử máy thật |
| Danh sách phân công → chọn A/B | Cả hai hồ sơ và các API thuốc/sức khỏe/lịch/cảnh báo trả đúng `nguoiCaoTuoiId` | Mở lần lượt A và B, quay lại; request đi đúng `/elderly/1/...` và `/elderly/2/...` | Chưa thử máy thật |
| Quyền truy cập | A đọc bốn nhóm dữ liệu B hoặc xác nhận thuốc B bị 403; phân công B hết hạn làm caregiver bị 403; `/me/appointments` của caregiver bị 404; B không thấy SOS A | Điều hướng hai hồ sơ chỉ từ danh sách phân công | Chưa thử máy thật |
| Loading/rỗng/mạng/quay lại/chữ lớn | Không dùng giả lập lỗi trên database app | Widget mock: 7 màn hình ở 360×740, chữ 1.8× không tràn; 7 màn hình lỗi mạng kết thúc loading và có Thử lại; quay lại khi health còn tải không setState sau dispose | Nút Back hệ thống/gián đoạn mạng native chưa thử |
| Bàn phím | Không ghi thêm dữ liệu để thử keyboard | Widget mock đăng nhập với inset bàn phím 300px và chữ 1.8×; giữ nội dung nhập. UI Web thử focus form và viewport 360×500, không tương đương bàn phím Android | Chưa thử máy thật |

Bằng chứng cuối: `MOBILE_API: PASS_READ_WRITE_SCOPE_SOS`, `MOBILE_UI: COMPLETED_ALL_READ_NAVIGATION`, `MOBILE_UI: SQL_CONFIRMED_MEDICATION_NOTIFICATION_PROFILE_SOS`, exit 0. API smoke cuối sau bổ sung kiểm tra email/phạm vi cũng đạt. Ảnh dữ liệu giả lập lưu ở `mobile/build/mobile-flow-*.png`, gồm home, medication, appointments, health, notifications, profile, profile-keyboard-size, sos, assigned, caregiver-a/b và logout. Đã xem ảnh chi tiết hồ sơ và thông báo SOS; bản ghi cảnh báo giữ đúng giờ Việt Nam, không bị cộng thêm 7 giờ.

### Nguyên nhân và file sửa trong lượt mobile này

1. Route `/home` luôn tạo `HomeScreen`, mặc dù đã có `CaregiverHomeScreen`: caregiver đăng nhập bị tải `/elderly/me` và không tới danh sách phân công. Sửa [mobile/lib/main.dart](mobile/lib/main.dart) dùng vai trò lưu sau xác thực, chung cho đăng nhập mới và khôi phục phiên; thêm regression cho màn hình thực tế sau khôi phục phiên.
2. Service caregiver gọi các route chi tiết thuốc/sức khỏe/lịch/cảnh báo chưa tồn tại. Màn hình lịch người cao tuổi cũng gọi route raw chưa tồn tại và phải dùng fallback. Bổ sung các route hiện hữu mà UI cần trong [hoSoNguoiCaoTuoi.routes.js](server/src/routes/hoSoNguoiCaoTuoi.routes.js) và [mobileProfile.controller.js](server/src/controllers/mobileProfile.controller.js): JWT + phạm vi hồ sơ, không tự chọn hồ sơ đầu tiên cho caregiver gọi `/me`, ngày giờ SQL dưới dạng wall time và sắp xếp ổn định. Các route mới chỉ phục vụ vai trò mobile.
3. Trang chủ lấy lịch đầu tiên từ danh sách toàn bộ lịch sắp giảm dần; có thể chọn lịch muộn hoặc đã qua nhưng vẫn Chưa đến. Sửa [appointment_storage.dart](mobile/lib/services/appointment_storage.dart) dùng nguồn upcoming được lọc thời gian/trạng thái và sắp tăng dần ở backend.
4. Form hồ sơ gửi `email` nhưng API không trả email và từ chối trường này, khiến lưu form luôn 400. Sửa [hoSoNguoiCaoTuoi.controller.js](server/src/controllers/hoSoNguoiCaoTuoi.controller.js): đọc email của user gắn hồ sơ, kiểm tra định dạng/độ dài/trùng; lưu email tài khoản và hồ sơ trong cùng transaction, vẫn chặn ID/CCCD/trường ngoài danh sách.
5. SOS chỉ lưu bảng SOS/cảnh báo, không tạo `ThongBao` hay số người đã thông báo mà UI cần. Sửa [emergencyAlert.controller.js](server/src/controllers/emergencyAlert.controller.js) tạo notification trong cùng transaction, chỉ người chăm sóc đang hoạt động và phân công còn hiệu lực; trả đúng số tài khoản, thời điểm và trạng thái bản ghi vừa lưu để UI không hiện Chưa cập nhật. Bổ sung lịch sử scoped trong [emergencyAlert.routes.js](server/src/routes/emergencyAlert.routes.js). Đây là tạo thông báo nội bộ, không phải bằng chứng người nhận đã đọc hoặc một dịch vụ push.
6. DATETIME2 cảnh báo/thông báo được driver trả dạng UTC khiến app cộng thêm 7 giờ. Sửa SELECT wall time trong [notification.controller.js](server/src/controllers/notification.controller.js) và phần danh sách phân công của [careAssistant.controller.js](server/src/controllers/careAssistant.controller.js); ngày hiệu lực phân công dùng ngày Việt Nam. API người chăm sóc của chính mình trước đó dùng dữ liệu đã rút gọn cho chatbot, mất `laChinh`/`moiQuanHe`, nên không thể hiển thị đúng khi có người chăm sóc chính; endpoint này nay trả đủ trường đúng assignment, vẫn bind ID hồ sơ từ JWT. Fixture ban đầu không đánh dấu chính nên thông báo Chưa có người chăm sóc chính là đúng trong lần đó; lượt cuối đặt assignment A chính và đối chiếu lại SQL/API/UI, không tự suy đoán người đầu tiên là chính. Có kiểm tra API đối chiếu thời điểm/trạng thái SOS.
7. Trang chủ bỏ qua lỗi thuốc/sức khỏe, chưa bắt lỗi tải thông báo/lịch; một số Row/chiều cao cố định tràn chữ lớn. Sửa [home_screen.dart](mobile/lib/screens/home/home_screen.dart), [notification_screen.dart](mobile/lib/screens/notifications/notification_screen.dart), [caregiver_elderly_detail_screen.dart](mobile/lib/screens/caregiver/caregiver_elderly_detail_screen.dart). Bổ sung tooltip Thông báo và thông báo tải lỗi có Thử lại, giữ bố cục/chức năng hiện tại.
8. Web mở hộp thoại xin quyền nhắc thuốc Android dù không hỗ trợ plugin. Sửa [medication_screen.dart](mobile/lib/screens/medication/medication_screen.dart) và [local_notification_service.dart](mobile/lib/services/local_notification_service.dart) chỉ hỏi quyền khi nền tảng hỗ trợ; luồng quyền Android vẫn cần máy thật để xác minh.

Kiểm thử: [mobile_flows_test.dart](mobile/test/mobile_flows_test.dart), [verify_mobile_flows.js](server/scripts/verify_mobile_flows.js), [verify_mobile_ui_flow.js](server/scripts/verify_mobile_ui_flow.js), cập nhật harness [verify_care_assistant_ui.js](server/scripts/verify_care_assistant_ui.js). Harness xử lý cuộn/focus, chờ snackbar và input semantics để bấm đúng trường; không coi các lỗi điều khiển CDP ban đầu là lỗi ứng dụng.

Kết quả hồi quy: **47/47 Flutter test**, **121/121 backend test**; analyze 8 file mobile liên quan: không có issue. Đây là bằng chứng bổ sung riêng với các lượt API/UI SQL thật ở trên. Không sửa `.env`, reset, merge hay push; giữ các thay đổi chatbot đang có trên nhánh `minh`.

### Chạy Android với database kiểm thử riêng

APK hiện tại chỉ nối API kiểm thử `127.0.0.1:5059`; cần USB reverse khi cài trên điện thoại. Không nối nó tới database app để thử SOS.

1. Trong terminal tại `server`, đặt password kiểm thử qua prompt kín (ít nhất 8 ký tự), chỉ giữ trong process; script tự kiểm tra fixture và thay hash của đúng ba tài khoản TEST ONLY:

```powershell
$env:MOBILE_TEST_DATABASE = 'CareAssistant_Test_1791560032538_c67e99'
$taskSecret = Read-Host 'Mat khau cho tai khoan TEST ONLY (>=8 ky tu)' -AsSecureString
$env:MOBILE_TEST_PASSWORD = [System.Net.NetworkCredential]::new('', $taskSecret).Password
try { node scripts/verify_mobile_flows.js --serve }
finally { Remove-Item Env:MOBILE_TEST_PASSWORD -ErrorAction SilentlyContinue }
```

Giữ terminal này chạy; Ctrl+C dừng server/pool. Không đưa mật khẩu/token vào lệnh ghi lịch sử, log, `.env` hoặc tài liệu. `--serve` không gửi SOS, chỉ chuẩn bị metadata giả lập và xác thực tài khoản test. Database test giữ lịch fixture ngày 09–12/10/2026; các ngày khác có thể thấy lịch hôm nay rỗng, không nên sửa database app để tạo dữ liệu thử.

2. Bật USB debugging, kết nối điện thoại; tại root project chọn đúng ID từ `flutter devices` và `adb devices`:

```powershell
adb -s <android-device-id> reverse tcp:5059 tcp:5059
adb -s <android-device-id> install -r mobile/build/app/outputs/flutter-apk/app-debug.apk
```

Mở app và đăng nhập `test.elder.a` hoặc `test.caregiver` bằng password vừa nhập. Chỉ dùng hồ sơ TEST ONLY. Cần thử tiếp quyền thông báo/báo thức, nhắc thuốc khi app nền, Back hệ thống, bàn phím native, chữ lớn và lỗi mạng trên Android.

3. Nếu chạy từ source, dùng `flutter run -d <android-device-id> --dart-define=API_BASE_URL=http://127.0.0.1:5059/api` sau USB reverse. Với emulator dùng cấu hình riêng `http://10.0.2.2:5059/api`. Nếu Gradle gặp lỗi đường dẫn có dấu, tạo bản sao mobile ở đường dẫn ASCII rồi `flutter pub get` và build/run tại bản sao; loại `.env`, `build`, `.dart_tool`, `.gradle` khi copy. Không reset hoặc chỉnh `.env` để đổi URL.

### Chạy lại kiểm tra tự động

```powershell
# Tai server; dong --serve truoc khi smoke de cong 5059 san sang
node scripts/verify_mobile_flows.js
node --test test/*.test.js

# Tai mobile
flutter test
flutter build web --debug --no-web-resources-cdn --dart-define=API_BASE_URL=http://127.0.0.1:5039/api --output=<ascii-web-output>

# Tai server
$env:ASSISTANT_UI_WEB_DIR = '<ascii-web-output>'
node scripts/verify_mobile_flows.js --ui
```

Phần dưới là lịch sử các lượt chatbot trước, không thay thế kết quả mobile cập nhật ở mục này.

## Bổ sung: API thật với dữ liệu không rỗng

Ngày 09/10/2026 đã hoàn tất xác minh dương tính, không dùng mock cho các kết quả dưới đây.

### Nguồn dữ liệu và cách ly

- Đọc database app hiện tại, chỉ xét năm hồ sơ có định danh trong DU_LIEU_MAU_DAY_DU.sql. Kết quả: 0 lịch thuốc tối nay, 0 lịch thuốc sáng mai, 2 lịch khám sắp tới; không có hồ sơ đủ cả ba điều kiện. Không ghi hoặc đăng nhập các tài khoản ở database app trong lượt này.
- Tạo hai database SQL Server mới hoàn toàn, tên duy nhất:
  - CareAssistant_Test_1791560032538_c67e99: lượt chức năng cục bộ.
  - CareAssistant_Test_1791560065667_e322ec: lượt gọi Groq thật.
- Database chỉ có dữ liệu tổng hợp TEST ONLY A/B và người chăm sóc TEST ONLY CAREGIVER. Không copy dữ liệu, mật khẩu hoặc hồ sơ người thật từ database app. Mật khẩu và JWT secret kiểm thử sinh ngẫu nhiên, chỉ tồn tại trong bộ nhớ; auth domain tách khỏi app.
- Script chỉ lấy các batch CREATE TABLE/INDEX và SET cần thiết từ schema, loại hoàn toàn preamble DROP/CREATE DATABASE/USE. Không chạy seed, reset hoặc đoạn SQL ghi đè. Dữ liệu tối thiểu: hai hồ sơ, một người chăm sóc được phân công cả hai, bốn thuốc có tên TEST, năm lịch thuốc và năm lịch khám (gồm lịch gần nhất, muộn hơn, đã hủy và đã qua).
- Chạy nguyên ứng dụng Express/router/JWT/controller/phân quyền/repository và SQL thật qua HTTP: lượt cục bộ cổng 60563, lượt Groq cổng 60598. Đây là tiến trình API kiểm thử riêng, không phải API app5000 đã được chuyển database. Chỉ ghi đè DB_DATABASE/JWT_SECRET/AI_PROVIDER trong bộ nhớ tiến trình script; không sửa .env. Tiến trình/pool kiểm thử đã đóng, hai database giả lập giữ lại để kiểm tra.

### Kết quả đối chiếu có bản ghi

Mỗi lượt chạy gồm 24 câu chat (hai hồ sơ × có/không dấu × sáu câu), thêm hai câu của cùng tài khoản chăm sóc khi đổi hồ sơ và hai yêu cầu âm tính. Tất cả phép đối chiếu đều đạt; POSITIVE_API: ALL_SOURCE_COMPARISONS_PASS, exit0.

| Tình huống | API SQL thật, dữ liệu kiểm thử tổng hợp | Đối chiếu |
| --- | --- | --- |
| Tối nay uống gì? | Hồ sơ A: TEST MED A EVENING, 19:00 ngày 09/10, chưa có xác nhận; B: thuốc B, 20:00, có xác nhận lúc 20:05 | ID, tên thuốc, liều đã lưu, ngày/giờ, trạng thái và thời điểm xác nhận bằng /elderly/me/medication-schedule; văn bản chứa đúng các trường |
| Còn sáng mai? | A: TEST MED A MORNING, 08:00 ngày 10/10; B: thuốc B sáng, 09:00. Lịch tối ngày mai được loại | Cùng API nguồn nhưng ngày mới và lọc sáng; không giữ thuốc/buổi tối cũ, không nói cần/phải uống |
| Tôi muốn xem lịch khám sau thuốc | Trả appointments và không còn tên TEST MED trong câu trả lời | Chuyển chủ đề ngay, dùng dữ liệu hồ sơ hiện tại |
| Lịch khám tiếp theo? | A: TEST CLINIC A, 08:00 ngày 11/10; B: TEST CLINIC B, 09:00 ngày 12/10, đều Chưa đến | ID/địa điểm/ngày/giờ/trạng thái khớp /appointments; không chọn lịch đã hủy/đã qua hoặc lịch muộn hơn |
| Ở đâu? | Trả đúng địa điểm của lịch kế tiếp vừa nêu, chỉ một bản ghi | ID và địa điểm khớp lịch từ API nguồn, tra cứu mới |
| Còn mấy ngày? | A còn 2 ngày; B còn 3 ngày theo ngày Việt Nam | Cùng ID lịch, soNgayConLai và câu trả lời khớp phép tính độc lập từ ngày API nguồn |
| Không dấu | Hai chuỗi trên đều đạt, gồm toi nay uong gi / con sang mai / o dau / con may ngay | Cùng bản ghi/giá trị với biến thể có dấu |
| Cùng người chăm sóc đổi A sang B | Thuốc trả về khác nhau và profile ID đúng A/B | Không lẫn thuốc; context A gửi cho B bị 400; người cao tuổi A yêu cầu B bị 403 |

Liều fixture cố ý đặt nhãn “LIỀU GIẢ LẬP …”, không phải hướng dẫn dùng thuốc thật. Ví dụ trên chỉ là dữ liệu tổng hợp trong database kiểm thử, không phải hồ sơ demo gốc hoặc người bệnh.

### Groq, chức năng dự phòng và mock

- Lượt không gọi Groq: 26 câu dương tính đều functional/missing_config do script chủ động dùng provider kiểm thử trong bộ nhớ. Đây là HTTP/SQL thật, không mock.
- Lượt dùng cấu hình Groq hiện có: 16 câu định tuyến grounded_data, 1 câu gặp AI_TOOL_GENERATION_FAILED và 9 câu gặp AI_RATE_LIMITED. Tất cả 26 câu vẫn trả dữ liệu khớp nguồn qua tra cứu mới; lý do dự phòng được giữ nguyên. Không coi các lượt quota/lỗi là Groq thành công.
- Model chỉ nhận câu hỏi/ngữ cảnh user phục vụ định tuyến; kết quả thuốc/lịch được dựng tại backend và không gửi trở lại model. Không đổi model/provider/billing của app hoặc retry vô hạn.
- Không phát hiện thêm lỗi logic trong đối chiếu có dữ liệu nên không sửa code ứng dụng trong lượt này. Chỉ thêm server/scripts/verify_assistant_positive_api.js và cập nhật báo cáo.
- Regression mock 121/121 của lượt trước là bằng chứng riêng, không thay thế các lượt API SQL thật vừa chạy. Không chạy UI hoặc Android/iOS trong lượt xác minh API này.

Lệnh tái chạy:

    cd server
    node scripts/verify_assistant_positive_api.js --scan-only
    node scripts/verify_assistant_positive_api.js
    node scripts/verify_assistant_positive_api.js --live-ai

Mỗi lượt dương tính tạo database kiểm thử mới, không tái sử dụng/ghi đè database có sẵn. Script không DROP database; có thể giữ database đã tạo để kiểm tra schema/dữ liệu tổng hợp. Không có điều kiện chạy bị chặn trong lượt này. Không reset/push hoặc thay đổi .env/database app.

## Bổ sung: hiểu câu tự nhiên và chuỗi tiếp nối

Đã kiểm tra API thực đang phục vụ app5000 với tài khoản seed giả lập được xác minh, không chạy seed hoặc sửa dữ liệu. Script mới server/scripts/verify_assistant_language.js đối chiếu ID bản ghi với API lịch thuốc/lịch khám nguồn, không in token/tên thuốc/số đo.

Nguyên nhân và thay đổi lượt này:

- “Còn sáng mai?” đã đổi ngày nhưng thiếu slot buổi sáng nên giữ evening trong context. Đã sửa việc thay ngày/buổi rõ ràng và bỏ entity cũ khi đổi khoảng thời gian; câu này hỏi cả lịch buổi sáng, không hỏi lại một thuốc tùy tiện.
- “Ở đâu?” chưa có thao tác location trong bộ giải quyết câu tiếp nối; chỉ Groq có lúc hiểu, fallback không hiểu. Đã thêm thao tác location gắn với appointments, tra lại cùng lịch kế tiếp và trả địa điểm đã lưu. Thao tác không phù hợp chủ đề (hỏi địa điểm sau thuốc) sẽ hỏi lại.
- Unknown trước đây cho model toàn bộ công cụ, có thể kéo câu “Đặt vé máy bay giúp tôi” về lịch khám. Nay câu thiếu chủ đề/thao tác và không phải trò chuyện/giải thích chung sẽ hỏi lại trước gọi model. Nhánh hướng dẫn/giải thích chung chỉ được công cụ general_help, không được tự chọn công cụ cá nhân.
- Chuẩn hóa “tui” và tiếng Việt không dấu; ngữ cảnh được giải quyết theo chủ đề + thao tác + ngày + buổi + đối tượng. Câu mới có chủ đề rõ thắng câu trước. Câu không liên quan là ranh giới, không tìm vượt qua nó để khôi phục chủ đề cá nhân cũ.
- Giữ quyền truy cập, SQL tham số hóa, context ký, timeout và nhãn hiện có. Không đổi model/provider hoặc billing. Thuốc chỉ diễn đạt lịch đã lưu và trạng thái xác nhận, không khẳng định cần/phải uống.

| Tình huống | API app thật, cả có dấu và không dấu | Phần có dữ liệu kiểm bằng mock |
| --- | --- | --- |
| Bạn làm được những gì? | capabilities; giới thiệu chức năng, rows/actions rỗng | Regression không gọi model/công cụ cá nhân |
| Giúp tui với | clarification: “Bạn cần mình hỗ trợ việc gì? …”; không lấy thuốc | Không gọi model hoặc repository.read |
| Tối nay uống gì? | medications; khớp API nguồn theo hồ sơ demo, hiện rỗng | Test thuốc sáng/tối, trạng thái chưa xác nhận |
| Còn sáng mai? | medications; khớp API nguồn ngày mai, hiện rỗng | dayOffset=1, period=morning; lấy cả hai lịch sáng, loại lịch tối, bỏ entity cũ |
| Lịch khám tiếp theo? → Ở đâu? → Còn mấy ngày? | Cả ba appointments; API nguồn không có lịch sắp tới, không tạo địa điểm/số ngày | Hai lịch có dữ liệu: cả hai câu tiếp nối đọc lại ID lịch kế tiếp, trả đúng địa điểm và số ngày từ backend |
| Sau thuốc: Tôi muốn xem lịch khám | appointments, không dùng context thuốc | Regression chủ đề mới thắng chủ đề cũ |
| Cái đó sao rồi? / Đặt vé máy bay giúp tôi | clarification, rows/actions rỗng | Không chọn công cụ; câu “Có gì hay không?” cũng không bị hiểu “cô” là tên người |

Lượt cuối kiểm 20 câu: toàn bộ ý định và các phép đối chiếu nguồn đều đạt. Ở lượt này, một câu không dấu “con may ngay?” gặp AI_TOOL_GENERATION_FAILED, modeReason ai_unavailable nhưng tra cứu dự phòng vẫn đúng. Các câu cá nhân còn lại grounded_data, không phải câu trả lời AI tự viết. Capabilities/clarification là định tuyến chức năng chủ động. Lượt tái hiện trước sửa cũng thấy rate limit Groq thật; không đổi cấu hình hoặc giả nhãn để che lỗi.

Backend regression cuối: 121/121 đạt, gồm test có dữ liệu cho slot buổi sáng/ngày mai, đọc lại lịch hẹn, câu mơ hồ và ranh giới chủ đề. Không thay mobile trong lượt này; không coi kết quả mock dương tính là API thật có dữ liệu. Không kiểm UI hoặc thiết bị vật lý lại trong lượt này vì yêu cầu tập trung API; các bằng chứng UI trước giữ nguyên.

File sửa lượt này: server/src/services/careAssistant.context.js, careAssistant.ai.js, careAssistant.service.js; server/src/controllers/careAssistant.controller.js; server/test/care-assistant-quality.test.js; server/scripts/verify_assistant_language.js (mới); MOBILE_COMPLETION.md. Không reset/push; .env và dữ liệu sức khỏe không đổi.

## Bổ sung: lỗi “bạn có thể hỗ trợ tôi được gì”

Đã sửa trên nhánh minh, giữ toàn bộ thay đổi trước đó. Xác minh trực tiếp backend app đang chạy http://127.0.0.1:5000/api, không dùng app Express riêng cho lượt này.

Nguyên nhân cụ thể: regex nhận diện trò chuyện chỉ nhận “hỗ trợ tôi gì/những gì”, thiếu “được gì”; detectIntent trả unknown. Vì vậy nhánh model buộc tool_choice required và đưa các công cụ cá nhân, kể cả khi đang hỏi khả năng. Sau câu hỏi thuốc, lịch sử user về thuốc vẫn vào model, dẫn tới chọn care_medications dù câu mới không phải câu tiếp nối. Không phải resolveQuestion tự kế thừa mọi câu: câu này có reference=false; lỗi là ý định chưa nhận diện và tool routing quá rộng khi unknown.

Tái hiện trước sửa qua API thật: câu chính xác ở chat mới và sau thuốc có lượt functional/ai_unavailable với AI_TOOL_GENERATION_FAILED; biến thể không dấu sau thuốc có lượt functional/grounded_data, intent medications. Tái hiện giao diện Chrome/Flutter thật qua proxy đến cùng API5000: câu chính xác ở chat mới gặp AI_TOOL_GENERATION_FAILED, sau thuốc bị medications/grounded_data. Hồ sơ demo đang thử không có thuốc hôm nay nên nhánh sai trả rows rỗng; không khẳng định tái hiện được đúng tên Metformin người dùng thấy, nhưng đã tái hiện được chọn sai công cụ thuốc. Không in bản ghi thuốc/token/khóa.

Sửa:

- careAssistant.context.js: ý định capabilities ưu tiên cho câu hỏi khả năng và biến thể không dấu; không thừa hưởng ngữ cảnh thuốc.
- careAssistant.ai.js: capabilities trả giới thiệu chức năng cục bộ trước kiểm tra cấu hình/Groq, không tạo client và không gọi công cụ cá nhân. Câu tiếp nối trò chuyện sau câu hỏi khả năng vẫn được nhận diện.
- careAssistant.service.js: giới thiệu ba câu theo chức năng hiện có, không dữ liệu cá nhân, không action và không token chủ đề mới.
- careAssistant.controller.js: capabilities không yêu cầu chọn hồ sơ.
- mobile/lib/models/care_assistant.dart: giải thích “Giới thiệu chức năng có sẵn trong ứng dụng.”, giữ nhãn chức năng trung thực. modeReason=capabilities là định tuyến chủ động, khác ai_unavailable và grounded_data; không giả nhãn AI.
- Regression: server/test/care-assistant-ai.test.js, mobile/test/care_assistant_test.dart. Bao phủ câu chính xác/không dấu, chat mới/sau thuốc, context thuốc, có/không cấu hình AI; zero personal reads và zero model calls. Câu “thuốc đó?” vẫn giữ chủ đề thuốc; câu mới về khám không bị kéo về thuốc.
- Script kiểm chứng: server/scripts/verify_assistant_capabilities.js (mới), verify_care_assistant_ui.js thêm --capabilities và --before; dùng API app thật5000, tài khoản seed giả lập xác minh trước đọc.

Sau sửa, cả bốn trường hợp API (có/không dấu × mới/sau thuốc) đạt: HTTP200, intent capabilities, mode functional, modeReason capabilities, không aiFailureCode, rows/actions rỗng. Backend 118/118 test đạt; Flutter 28/28 đạt; analyzer sạch.

Giao diện sau sửa cũng hoàn tất cả hai lượt qua API app5000: CAPABILITY_UI: COMPLETED_RUNNING_APP_API. Đã xem trực tiếp ảnh mobile/build/capability-new_chat-after.png và capability-after_medication-after.png: đúng câu hỏi, toàn bộ lời giới thiệu mới, dòng giải thích chức năng chủ động và không có nút lịch thuốc trong câu trả lời này. Trước sửa lưu ảnh tương ứng hậu tố -before. Flutter SelectableText render trên canvas nên script kiểm metadata phản hồi và ảnh được kiểm tra trực quan; không coi việc so toàn văn bằng DOM accessibility là bằng chứng. Chưa kiểm thiết bị Android/iOS vật lý.

Câu trả lời sau sửa:

> Mình có thể giúp bạn xem lịch thuốc và việc đã xác nhận uống, lịch khám, chỉ số sức khỏe đã lưu, người chăm sóc, thông báo và nhật ký. Bạn cũng có thể hỏi cách dùng ứng dụng; nếu chăm sóc nhiều người, hãy chọn hồ sơ trước khi hỏi dữ liệu của họ. Mình không chẩn đoán, kê thuốc, đổi liều hoặc tự gửi SOS.

Lệnh kiểm chứng API đang phục vụ app: node server/scripts/verify_assistant_capabilities.js. Giao diện: ASSISTANT_UI_WEB_DIR trỏ Flutter web build, chạy node server/scripts/verify_care_assistant_ui.js --capabilities; cổng5039 phục vụ UI/proxy còn API xử lý là tiến trình app5000. Không reset/push hoặc sửa .env; nodemon đã nạp backend mới.

Ngày xác minh: 09/10/2026, múi giờ Asia/Ho_Chi_Minh.

## Phạm vi và cấu trúc

- Mobile: Flutter/Dart; web quản trị: React/Vite.
- Backend: Node.js/Express, JWT, mssql; database SQL Server cấu hình trong server/.env. Môi trường kiểm tra kết nối localhost / QLSucKhoeNguoiCaoTuoi. Không đổi .env.
- Đăng nhập mobile gọi /api/auth/login, nhận JWT, xác định vai trò/phạm vi hồ sơ. Người cao tuổi chỉ dùng hồ sơ liên kết tài khoản; người chăm sóc chọn hồ sơ đang được phân công. Các API dữ liệu và chatbot kiểm tra lại quyền ở backend.
- Giữ thay đổi hiện có; không reset, merge, push, chạy seed hoặc sửa dữ liệu sức khỏe. Đăng nhập demo có tác động nhật ký/last-login theo luồng auth sẵn có.

## Nguyên nhân tìm được và cách sửa

1. Luồng cũ nhận diện chủ yếu bằng từ khóa, thay câu tiếp nối bằng câu trước và để model viết lại dữ liệu công cụ. Điều này làm mất ý “còn mấy ngày”, loại chỉ số hoặc đối tượng đang nói tới. Đã thêm chuẩn hóa tiếng Việt/không dấu/lỗi gõ nhẹ, bộ giải quyết ý định/ngày/buổi/trạng thái và ngữ cảnh đối tượng ký HMAC. Ngữ cảnh chỉ là gợi ý tra cứu, không chứa số đo/liều/số điện thoại để dùng lại.
2. Ngữ cảnh chưa ràng buộc chắc với tài khoản/hồ sơ. Đã ràng buộc token với cả hai, hết hạn 30 phút; kiểm tra quyền trước mỗi lần đọc và trước trả lời. Đổi hồ sơ/phiên sẽ hủy request, xóa ngữ cảnh; phản hồi muộn bị bỏ. Cache chỉ tồn tại trong lượt, không dùng hồ sơ khác dự phòng.
3. Truy vấn ngày giờ phụ thuộc đồng hồ/múi giờ máy chạy; cách chuyển SQL datetime/time sang JavaScript rồi Flutter có thể lệch 7 giờ. Đã dùng ngày giờ Việt Nam rõ ràng trong truy vấn, giữ giờ địa phương của lịch khám và bỏ hậu tố UTC giả ở timestamp chỉ số mobile. Chọn chỉ số gần nhất theo từng loại, có thứ tự ID khi trùng giờ, không lấy số đo tương lai.
4. Lịch thuốc chưa diễn đạt rõ “được lên lịch” và “đã xác nhận”; lịch khám chưa lọc đủ sắp tới/đã qua/đã hủy; join đơn thuốc chưa ràng buộc đầy đủ hồ sơ. Đã sửa các điều kiện này và lỗi API lịch thuốc từ chối hồ sơ CanChamSocDacBiet.
5. Gán request.timeout không bảo đảm timeout trên driver mssql hiện có. Đã thêm deadline thực, hủy request SQL khi quá hạn, tổng lượt 35 giây, model 20 giây, truy vấn tối đa 10 giây hoặc thời gian còn lại; không retry SDK, giới hạn công cụ/lịch sử/tin hiển thị.
6. Lời chào từng bị ép gọi công cụ. Luồng trò chuyện chung không đọc hồ sơ; dữ liệu cá nhân bắt buộc công cụ đã kiểm tra quyền. Model chỉ định tuyến; sau khi có dữ liệu, backend dựng câu trả lời từ bản ghi mới, không gửi kết quả sức khỏe trở lại model. Nhãn functional/grounded_data là trung thực. Lỗi quota/model/timeout/lấy dữ liệu được phân biệt; lỗi lấy dữ liệu không biến thành “không có dữ liệu”.

Luồng hiện tại: câu hỏi + gợi ý ngữ cảnh đã ký → nhận diện/chọn công cụ → kiểm tra tài khoản và hồ sơ → SQL tham số hóa, có deadline → chuẩn hóa bản ghi → trả lời ngắn theo dữ liệu → action thuộc danh sách màn hình cho phép, mang đúng hồ sơ. Thông báo dùng UserID của tài khoản đăng nhập, không dùng ID hồ sơ được chọn. Không dùng câu trả lời cũ làm nguồn sự thật.

Nhiều thuốc/người chăm sóc/lịch phù hợp sẽ hỏi lại thay vì chọn ngẫu nhiên. Câu hỏi tiếp nối tra cứu lại; thiếu loại chỉ số đã hỏi không thay bằng loại khác. Số đo kèm thời điểm và không bị diễn giải thành chẩn đoán tổng thể. Không kê thuốc/đổi liều/tự gửi SOS.

## Bằng chứng kiểm tra

| Tình huống | Kết quả và nguồn đối chiếu |
| --- | --- |
| API thật, SQL thật, hai tài khoản giả lập nct.an/nct.binh | Đã xác minh tài khoản và định danh thuộc seed trước đọc dữ liệu; /auth/login và /care-assistant/chat thành công. |
| Thuốc có dữ liệu | Ngày lưu 03/10/2026 có 2 và 3 lịch ở hai hồ sơ; ID, tên, liều, giờ dự kiến, trạng thái, giờ xác nhận khớp /elderly/me/medication-schedule. Câu trả lời chứa tên/liều của các bản ghi nguồn. |
| Thuốc hôm nay, không dấu, lỗi gõ, buổi tối | Đối chiếu API nguồn; dữ liệu ngày hiện tại rỗng được trả đúng, bộ lọc buổi tối đúng. |
| Lịch khám | Bản ghi đã qua khớp ngày/giờ/nơi khám của /appointments. Ngày mai, sắp tới và đã hủy hiện rỗng; không tạo lịch. Lịch sử chat cài thông tin sai 2099/999 không được dùng. |
| Chỉ số | Hai hồ sơ có dữ liệu khác nhau; giá trị, đơn vị, thời điểm và ID khớp /elderly/me/health-metrics. Câu hỏi “chỉ số đó?” giữ đúng loại huyết áp và đọc lại, kể cả hồ sơ thiếu huyết áp. |
| Người chăm sóc, thông báo | Câu tiếp nối số điện thoại đối chiếu /elderly/me/caregivers; số thông báo chưa đọc đối chiếu /notifications/me của tài khoản. |
| Cùng tài khoản chăm sóc đổi hồ sơ | caregiver01 được phân công hai hồ sơ giả lập An/Cường, được xác minh từ seed; trả lời hai hồ sơ khác nhau, giữ đúng profile ID. Context của hồ sơ trước bị từ chối 400 khi gửi sang hồ sơ sau. Bình không thuộc phân công tài khoản này; không sửa phân công để ép test. |
| Vượt quyền/context giả | Người cao tuổi yêu cầu hồ sơ khác: 403. Token ngữ cảnh sửa sai: 400. |
| Groq qua API chat thực tế | Lời chào và tiếp nối trả mode ai. Bốn câu hỏi thuốc/chỉ số của hai hồ sơ demo định tuyến thành công, modeReason grounded_data; kết quả công cụ không gửi ra model. Giữ model openai/gpt-oss-20b và provider hiện có, không tự đổi dịch vụ/billing. |
| Flutter Web/Chrome thực | Đăng nhập demo → mở trợ lý → hỏi chỉ số → thấy dữ liệu có thời điểm và nhãn trợ lý chức năng → bấm action mở đúng màn hình chỉ số của cùng hồ sơ. Theo dõi request xác nhận profile ID; không có request gửi SOS. |
| Lỗi/quota/timeout/đổi phiên lúc đang trả lời | Kiểm thử kiểm soát bằng test backend/mobile: dự phòng có lý do, lỗi công cụ không thành dữ liệu rỗng, không tin trùng, phản hồi cũ bị bỏ, hủy request và xóa ngữ cảnh. |

Script kiểm tra chỉ in trạng thái/mốc PASS/mã cố định; không in mật khẩu, token hoặc bản ghi sức khỏe. Khóa nằm ngoài báo cáo. Các hồ sơ dùng ở trên đã xác minh là dữ liệu giả lập; không thử với hồ sơ người thật.

## Lệnh và kết quả

Chạy trong server:

    node --test test/care-assistant.test.js test/care-assistant-ai.test.js test/care-assistant-privacy.test.js test/care-assistant-quality.test.js test/care-assistant-time.test.js test/cors.test.js
    node scripts/verify_care_assistant_quality.js
    node scripts/verify_care_assistant_quality.js --demo-ai
    node scripts/check_care_assistant_api.js --local-app

Backend: 117/117 test đạt. API chất lượng thực: đạt, gồm đổi hai hồ sơ trên cùng tài khoản chăm sóc. --demo-ai đã xác minh bốn lần định tuyến Groq thực; lần kiểm tra cuối dùng chức năng cục bộ để không gọi thêm upstream không cần thiết.

Chạy trong mobile:

    flutter test --no-pub test/care_assistant_test.dart test/care_assistant_sos_test.dart test/api_client_test.dart
    flutter analyze --no-pub lib/models/care_assistant.dart lib/services/care_assistant_controller.dart lib/services/care_assistant_service.dart lib/screens/assistant lib/widgets/assistant_message_bubble.dart test/care_assistant_test.dart

Flutter: 27/27 test đạt; analyzer không có vấn đề. Web build cần output vào đường dẫn ASCII trong TEMP vì native compiler gặp đường dẫn workspace có dấu. Smoke Chrome dùng server/scripts/verify_care_assistant_ui.js với ASSISTANT_UI_WEB_DIR trỏ output và API_BASE_URL=http://127.0.0.1:5039/api. Ảnh demo tại mobile/build/chat-ui-demo.png và mobile/build/chat-ui-detail-demo.png là artifact build không commit.

## File thay đổi

- Backend: server/src/controllers/careAssistant.controller.js; chiSoSucKhoe.controller.js; lichKhamBenh.controller.js; lichUongThuoc.controller.js; server/src/middlewares/mobile-scope.middleware.js.
- Dịch vụ: server/src/services/careAssistant.ai.js; careAssistant.repository.js; careAssistant.service.js; careAssistant.tools.js; careAssistant.context.js (mới); careAssistant.session.js (mới); server/src/utils/boundedQuery.js (mới).
- Mobile: mobile/lib/models/care_assistant.dart; mobile/lib/services/care_assistant_controller.dart; care_assistant_service.dart; mobile/lib/screens/assistant/care_assistant_screen.dart; mobile/lib/widgets/assistant_message_bubble.dart.
- Kiểm thử: server/test/care-assistant.test.js; care-assistant-ai.test.js; care-assistant-quality.test.js (mới); care-assistant-time.test.js (mới); mobile/test/care_assistant_test.dart.
- Script: server/scripts/check_care_assistant_ai.js; check_care_assistant_api.js; verify_care_assistant_quality.js (mới); verify_care_assistant_ui.js (mới).
- Tài liệu: mobile/CARE_ASSISTANT.md và MOBILE_COMPLETION.md. Các ghi chép kiểm thử trước trong CARE_ASSISTANT.md là lịch sử; báo cáo này ghi kết quả lượt hiện tại.

## Chưa xác minh và giới hạn

- Chưa chạy thiết bị Android/iOS vật lý; đã chạy Flutter Web trên Chrome thực.
- Demo hiện không có lịch khám sắp tới/đã hủy không rỗng tại ngày kiểm tra. Các nhánh có dữ liệu, trùng đối tượng và “còn mấy ngày” được test kiểm soát; không tạo/sửa lịch trong SQL để ép kết quả.
- Quota, SQL outage và thu hồi quyền giữa lượt được kiểm tra có kiểm soát, chưa gây sự cố thật hoặc sửa tài khoản demo để thử.
- Bản ghi lịch sử đã lưu lệch giờ từ trước không thể tự suy luận giờ đúng; không rewrite dữ liệu cũ. Đã sửa cách đọc/ghi cho luồng hiện tại, kiểm thử giờ nhập không bị dịch theo timezone máy.
- Hiểu câu tự nhiên vẫn có giới hạn; câu chưa rõ trả lời/hỏi lại ngắn, không tự tạo dữ liệu.
- Cần khởi động lại backend đang chạy để nạp code mới. Không có thay đổi cấu hình bí mật hoặc nhà cung cấp.
# Kiểm tra bổ sung chatbot Android — 10/10/2026

Đã sửa bố cục tiêu đề/hồ sơ → danh sách tin nhắn Expanded → ô nhập SafeArea đáy; hỗ trợ nhiều dòng có giới hạn, Markdown an toàn và giữ vị trí đọc tin cũ. Thay đổi prompt ưu tiên câu trả lời ngắn, giữ quy tắc sức khỏe và chế độ dự phòng.

Kết quả: backend 143/143; Flutter 65/65; chạy lại test bố cục sau chỉnh cuối 3/3; Flutter analyze cuối: No issues found. Build APK ARM64 thành công, bản riêng `mobile/build/app/outputs/flutter-apk/app-chat-layout-debug.apk`, API USB `http://127.0.0.1:5000/api`. Mock không phải bằng chứng AI thật.

Thiết bị 51330c42 có kết nối adb. Integration test Android chạy tới kiểm tra giữ vị trí đọc tin cũ, nhưng kiểm tra IME thất bại (inset 0); bản test bổ sung mở bàn phím chưa chạy xong vì cài đặt bị Android chặn. Cài app thường bằng `adb install -r` cũng trả `INSTALL_FAILED_USER_RESTRICTED`. Package/activity hiện không tìm thấy; không khẳng định app mới đã mở hoặc dữ liệu app đã được giữ. Chưa xác minh trọn vẹn bàn phím thật, chữ lớn và thanh điều hướng với APK cuối. Cần bật/chấp nhận cài đặt USB trên điện thoại; không tiếp tục cơ chế cài Flutter tự thử gỡ app khi lỗi.
