# Trợ lý chăm sóc

## Sử dụng

- Người cao tuổi: nút **Trợ lý chăm sóc** ở đầu trang chủ.
- Người chăm sóc: biểu tượng trợ lý trên thanh tiêu đề **Người tôi chăm sóc**, kể cả khi trang đang báo lỗi tải dữ liệu.
- Nếu có nhiều người được phân công, chọn hồ sơ trong màn hình chat. Đổi hồ sơ sẽ xóa cuộc trò chuyện và bản nháp cũ.
- Trợ lý hiểu câu có dấu/không dấu: thuốc hôm nay, lịch khám tiếp theo, sức khỏe gần nhất, người chăm sóc, thông báo chưa đọc, việc hôm nay, nhật ký, SOS và hướng dẫn ứng dụng.
- Có **AI tiếng Việt qua Groq** khi backend được cấu hình và trả lời thành công. Thiếu cấu hình hoặc AI lỗi sẽ dùng **Trợ lý theo chức năng**, có giải thích rõ trong từng phản hồi. Dữ liệu tra cứu lấy từ SQL Server thông qua backend; không có dữ liệu giả trong ứng dụng.
- Bản hiện tại chưa có module kế hoạch chăm sóc riêng. “Việc hôm nay” tổng hợp lịch thuốc, lịch khám và số nhật ký đã ghi, đồng thời thông báo giới hạn này.
- Các nút chi tiết mở màn hình đọc dữ liệu trong phạm vi chatbot. Thông báo mở màn hình hiện có; SOS mở màn hình Người chăm sóc hiện có và vẫn cần người dùng xác nhận. Trợ lý không tự gửi SOS, gọi điện, đánh dấu uống thuốc hoặc ghi dữ liệu.

## Chạy

Backend dùng `.env` hiện có và ba biến Groq bên dưới. Không cần migration:

```powershell
cd server
npm.cmd run dev
```

### Cấu hình Groq tại máy của bạn

Backend dùng SDK chính thức OpenAI đã có, nhưng cố định baseURL `https://api.groq.com/openai/v1` và chỉ gọi **Chat Completions**. Tên SDK/model chứa “OpenAI” không có nghĩa request gửi tới dịch vụ OpenAI. Không dùng Responses, không chuyển provider dự phòng. Cần Node.js từ 22 trở lên; máy kiểm tra dùng Node 24.

Trong `server/.env`, giữ khóa Groq chỉ ở backend và thêm:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
```

Khóa trống trên là mẫu: tự điền trong editor, không gửi vào chat, Flutter, Git hoặc log. Trên máy hiện tại cả ba biến đã cấu hình; nếu thay đổi .env hãy khởi động lại backend hiện có. Không sửa database. Thiếu một biến hoặc provider khác Groq sẽ dùng trợ lý theo chức năng; biến OPENAI_API_KEY/OPENAI_MODEL cũ không được sử dụng.

Model `openai/gpt-oss-20b` hiện hoạt động và hỗ trợ local tool calling theo [trang model](https://console.groq.com/docs/model/openai/gpt-oss-20b). [Bảng hạn mức Free plan](https://console.groq.com/docs/rate-limits) công bố 30 request/phút, 1.000 request/ngày, 8.000 token/phút và 200.000 token/ngày. Hạn mức tính theo tổ chức; kiểm tra hạn mức thực tế trong Console. Một câu hỏi có thể dùng 2–3 request. Không bật billing hoặc tự chuyển API trả phí.

Kiểm tra kết nối thật chỉ dùng lịch **giả lập**, không đọc database:

```powershell
cd server
node scripts/check_care_assistant_ai.js
```

Khi chưa thêm model vào .env, có thể thử riêng kết nối:

```powershell
node scripts/check_care_assistant_ai.js --model openai/gpt-oss-20b
```

Tham số này chỉ cho script, không cấu hình app và không sửa .env. Script dùng luồng chat thật với công cụ lịch giả lập, rồi câu tiếp nối; tối đa 6 request, không retry. Chỉ in trạng thái cấu hình, mã HTTP hoặc trạng thái thành công; không in khóa, câu hỏi, kết quả công cụ, nội dung phản hồi hay lỗi SDK. Exit code 0: thành công, 1: lỗi, 2: thiếu cấu hình. Script không chạy trong test tự động.

Định dạng tích hợp theo [Groq OpenAI compatibility](https://console.groq.com/docs/openai), [Local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling) và [Chat API reference](https://console.groq.com/docs/api-reference): messages system/user/assistant, assistant.tool_calls, tool.tool_call_id. Chỉ cung cấp các function cố định của app, không bật công cụ web/code có sẵn của nhà cung cấp.

### Dữ liệu gửi tới Groq

Màn hình giới thiệu thông báo câu hỏi, ngữ cảnh gần đây và dữ liệu cần thiết được gửi tới Groq. Chỉ gửi tối đa 8 dòng của nhóm cần tra cứu; không gửi toàn bộ hồ sơ hoặc tên/ID hồ sơ trong system prompt. Lịch sử có thể chứa dữ liệu từ các câu hỏi trước; không lưu lâu dài trong app/backend.

Theo [Your Data in GroqCloud](https://console.groq.com/docs/your-data), đầu vào/đầu ra inference không được lưu mặc định, nhưng log phục vụ độ tin cậy/chống lạm dụng có thể lưu tới 30 ngày (hoặc lâu hơn theo yêu cầu pháp luật). Metadata sử dụng vẫn được lưu; dữ liệu được lưu có thể ở Mỹ. ZDR có thể bật trong Data Controls; code này không bật và chưa xác minh cài đặt tài khoản.

[Groq Services Agreement](https://console.groq.com/docs/legal/services-agreement) quy định trách nhiệm có quyền gửi dữ liệu, không dùng dữ liệu để huấn luyện/fine-tune nếu chưa được cho phép, và không dùng AI để đưa lời khuyên y tế chuyên môn. Trợ lý chỉ tra cứu dữ liệu đã lưu và giải thích chung; không chẩn đoán/kê thuốc/đổi liều. PHI và BAA có điều kiện riêng; không mặc định Free plan đáp ứng yêu cầu đó. Trước khi dùng dữ liệu sức khỏe thật, cần đánh giá quyền gửi, thông báo/đồng ý và chính sách phù hợp. Kiểm tra kết nối trong lượt này chỉ dùng dữ liệu giả lập.

Flutter trên Android Emulator (backend mặc định port 5000):

```powershell
cd mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api
```

Điện thoại thật: thay `10.0.2.2` bằng IPv4 LAN của máy chạy backend, cùng mạng và cho phép port backend qua firewall. Flutter Web trên chính máy backend: dùng `http://localhost:5000/api`. Nếu `.env` đặt port khác, đổi URL tương ứng. Khởi động lại backend sau khi lấy mã mới.

## API và bảo vệ dữ liệu

- `GET /api/care-assistant/profiles`: chỉ hồ sơ của người cao tuổi hoặc hồ sơ đang phân công cho người chăm sóc.
- `POST /api/care-assistant/query`: `{ "question": "Hôm nay tôi uống thuốc gì?", "elderlyId": 7 }`. Người chăm sóc cần chọn ID khi hỏi dữ liệu hồ sơ; người cao tuổi được suy ra ID của mình.
- `GET /api/care-assistant/status`: trả aiConfigured, provider, model và keyConfigured (boolean), không trả giá trị khóa. Có cấu hình chưa chứng minh kết nối thành công; nhãn **AI** chỉ xuất hiện sau phản hồi AI thành công.
- `POST /api/care-assistant/chat`: thêm `history: [{role: "user", content: "Lịch khám tiếp theo?"}, {role: "assistant", content: "Câu trả lời trước"}]`. Mobile dùng endpoint này cho hội thoại. Các màn hình chi tiết giữ `/query` để đọc dữ liệu theo chức năng, tránh gọi AI không cần thiết.
- Bổ sung hai API đọc mà Mobile hiện đã gọi nhưng backend trên nhánh này chưa có: `GET /api/elderly/me/caregivers` và `GET /api/caregivers/me/elderly`.
- Dùng JWT hiện có và kiểm tra trạng thái/vai trò tài khoản trong database. Người cao tuổi không được gửi ID khác; người chăm sóc phải có phân công còn hiệu lực.
- Truy vấn SQL cố định, tham số ID được bind; không nhận tên bảng, SQL hoặc URL điều hướng từ câu hỏi.
- Câu hỏi 1–500 ký tự, request tra cứu tối đa 4 KB, request chat tối đa 26 KB, 30 lượt/phút/tài khoản theo từng tiến trình backend. SQL timeout 10 giây, danh sách tra cứu tối đa 50 mục và báo khi bị giới hạn. Nếu triển khai nhiều tiến trình, cần rate limit dùng chung.
- Chat chỉ ở bộ nhớ. Đổi phiên xóa chat/hồ sơ/bản nháp, bỏ kết quả request cũ. Backend không ghi nội dung chat vào database hoặc log. Thời gian SQL giữ giờ đã lưu; “lấy dữ liệu” là thời gian phản hồi.
- Lỗi mạng/SQL được báo riêng, không được chuyển thành “chưa có dữ liệu”.

### Ngữ cảnh, công cụ và giới hạn AI

- Ngữ cảnh chỉ trong bộ nhớ của controller Flutter hiện tại; backend không lưu hội thoại, không dùng conversation ID của nhà cung cấp. Mỗi request gửi messages có giới hạn; không gửi tham số Responses như store hoặc previous_response_id.
- Tối đa 8 tin lịch sử (4 lượt hỏi/đáp), tổng 6000 ký tự; câu hỏi 500 ký tự; câu trả lời AI tối đa 2200 ký tự. Không đưa tin lỗi vào ngữ cảnh. Retry thay tin lỗi, không thêm bản sao câu hỏi.
- Đổi hồ sơ được phép khi request còn chờ: xóa chat, lịch sử, bản nháp và bỏ phản hồi cũ. Đăng xuất/đổi phiên thực hiện tương tự. Backend không có ngữ cảnh dùng chung để trộn giữa các phiên/hồ sơ.
- Backend coi lịch sử do client gửi là ngữ cảnh chưa xác minh, không phải nguồn sự thật. Câu hỏi tiếp nối phải tra lại dữ liệu. Nếu “thuốc đó” không rõ thuốc nào, AI được yêu cầu hỏi lại.
- Lịch khám có `soNgayConLai` được SQL tính theo ngày lịch của máy chủ, để câu hỏi “Còn mấy ngày nữa?” dùng số mới từ backend thay vì đoán từ tin cũ.
- Các công cụ `care_medications`, `care_appointments`, `care_health`, `care_caregivers`, `care_notifications`, `care_today`, `care_notes` chỉ đọc. `care_general_help` không đọc hồ sơ. Giải thích chung như “Huyết áp là gì?” không gửi chỉ số cá nhân.
- Công cụ không có tham số ID, SQL, URL hoặc code. Danh tính và hồ sơ lấy từ controller đã xác thực. Từng lần đọc kiểm tra tài khoản hoạt động, vai trò trong DB và liên kết/phân công còn hiệu lực. Kiểm tra lại quyền trước khi trả phản hồi AI.
- Tối đa 8 dòng mỗi nhóm dữ liệu gửi AI; bỏ ID, giới hạn chuỗi 300 ký tự. Không gửi tên/ID hồ sơ trong prompt hệ thống. Nhật ký chỉ gửi khi cần và được đánh dấu dữ liệu không đáng tin. Nếu danh sách bị giới hạn, UI báo và có nút xem thêm.
- Ngân sách AI 20 giây, tối đa 3 lần gọi Chat Completions, 4 tool calls và 1500 completion tokens mỗi lần (gồm reasoning); GPT-OSS dùng reasoning_effort=low; SDK không retry tự động. Mobile chờ response chat tối đa 45 giây. `/chat` giới hạn payload 26 KB, `/query` 4 KB; cả hai dùng rate limit 30 lượt/phút/tài khoản theo tiến trình hiện có.
- Lỗi AI/timeout/HTTP 429 hết hạn mức/response không hợp lệ dùng tra cứu dự phòng; lỗi SQL là 503, mất quyền là 403, thiếu hồ sơ là 400/404, không được giả vờ dữ liệu trống. Dự phòng có thể tra lại chủ đề gần nhất nhưng không diễn đạt tự nhiên như AI.
- Triệu chứng khẩn cấp, SOS và yêu cầu đổi liều được xử lý bởi hướng dẫn an toàn theo chức năng. AI không có công cụ mutation. Nút điều hướng do backend ánh xạ từ các công cụ đã dùng và Flutter kiểm tra enum cố định.
- Prompt và kiểm tra đầu ra hạn chế chẩn đoán, đổi liều, xác nhận gửi SOS giả và URL; đây không phải cam kết mọi câu trả lời model đều chính xác. Cần xác minh chất lượng tiếng Việt/câu tiếp nối với model thật trước khi sử dụng thực tế.

## Các file thay đổi

Mobile thêm:

- `lib/models/care_assistant.dart`
- `lib/services/care_assistant_service.dart`
- `lib/services/care_assistant_controller.dart`
- `lib/screens/assistant/care_assistant_screen.dart`
- `lib/screens/assistant/care_assistant_records_screen.dart`
- `lib/widgets/assistant_message_bubble.dart`
- `test/care_assistant_test.dart`
- `test/care_assistant_sos_test.dart`
- `CARE_ASSISTANT.md`

Mobile sửa:

- `lib/services/api_client.dart`: phát tín hiệu đổi phiên để màn hình xóa dữ liệu ngay.
- `lib/screens/home/home_screen.dart`: nút mở trợ lý.
- `lib/screens/caregiver/caregiver_home_screen.dart`: nút mở trợ lý.

Backend thêm:

- `src/routes/careAssistant.routes.js`
- `src/controllers/careAssistant.controller.js`
- `src/services/careAssistant.service.js`
- `src/services/careAssistant.repository.js`
- `src/services/careAssistant.ai.js`
- `src/services/careAssistant.tools.js`
- `test/care-assistant.test.js`
- `test/care-assistant-ai.test.js`
- `test/care-assistant-privacy.test.js`
- `scripts/check_care_assistant_ai.js`

Backend sửa:

- `src/routes/index.js`
- `src/routes/hoSoNguoiCaoTuoi.routes.js`
- `src/routes/nguoiChamSoc.routes.js`
- `package.json`, `package-lock.json`: SDK OpenAI.
- `.env.example`: tên biến cấu hình; không chứa khóa thật.
- `src/app.js`, `src/middlewares/error.middleware.js`: bỏ log URL trợ lý và che chi tiết lỗi, kể cả JSON lỗi có thể chứa nội dung riêng tư.

## Kiểm thử

```powershell
cd server
node --test test/care-assistant.test.js test/care-assistant-ai.test.js test/care-assistant-privacy.test.js
cd ../mobile
flutter analyze --no-pub
flutter test --no-pub
flutter build web --no-pub
```

Nếu công cụ build assets lỗi vì đường dẫn project có dấu tiếng Việt, dùng thư mục đầu ra không dấu:

```powershell
flutter build web --no-pub --no-wasm-dry-run --output "$env:TEMP/care-assistant-web"
```

Các test backend dùng database thay thế trong test để kiểm tra JWT, phạm vi truy cập, input, rate limit, dữ liệu rỗng và lỗi SQL. Đã kiểm tra thêm tám nhóm SELECT và truy vấn hồ sơ phân công trên SQL Server thật bằng ID không tồn tại; không đọc hồ sơ cá nhân, không ghi dữ liệu. Chưa kiểm tra kết quả nghiệp vụ với tài khoản/hồ sơ thật, gọi điện hoặc gửi SOS trên điện thoại thật. Build Web không thay thế kiểm thử Android/iOS trên thiết bị.

Test AI dùng mock, gồm cả round-trip SDK chính thức với fetch giả; không gọi Groq hoặc OpenAI thật trong test tự động. Các test bao phủ câu tiếp nối, thiếu khóa, timeout/lỗi AI, tham số công cụ sai, chỉ dẫn giả trong nhật ký, đọc sai quyền, thu hồi phân công, đổi hồ sơ/phiên và chống SOS trùng.

Lượt chuyển Groq: giữ nguyên thay đổi chưa commit trên nhánh minh. Không sửa Web, schema/database, không reset/clean/commit/push.

Kết quả test mock: backend **89/89 pass**, gồm HTTP 400/401/403/429/500/503, timeout, thiếu cấu hình, tool arguments sai, prompt injection, quyền từng hồ sơ, Chat Completions serialization, không retry và không chuyển API trả phí. Flutter **15/15 pass**, gồm câu tiếp nối, đổi hồ sơ, đổi phiên, bỏ phản hồi cũ và chống SOS trùng. `flutter analyze --no-pub`: **No issues found**.

Kết nối Groq thật: script chạy với `--model openai/gpt-oss-20b` trả `OK_SYNTHETIC_TOOLS_AND_FOLLOWUP`. Đã xác minh kết nối, gọi công cụ lịch giả lập và giữ hội thoại tiếp nối. Không gửi dữ liệu sức khỏe cá nhân. Chưa xác minh toàn bộ chất lượng tiếng Việt/công cụ với tài khoản và dữ liệu thật, trạng thái ZDR, Android/iOS hoặc thiết bị thật. Tại lượt kiểm tra trước, app còn thiếu GROQ_MODEL; lượt kiểm tra API hiện tại đã xác nhận model được backend nạp. Tham số script không thay thế cấu hình app.

Các file sửa riêng lượt Groq:
- `server/.env.example`: ba biến Groq và model Free plan.
- `server/src/services/careAssistant.ai.js`: cấu hình Groq, base URL cố định, Chat Completions, messages/tool results, giới hạn và dự phòng.
- `server/src/services/careAssistant.tools.js`: function schema theo Chat Completions; giữ SQL và kiểm tra quyền.
- `server/scripts/check_care_assistant_ai.js`: kiểm tra thật bằng dữ liệu giả lập; chỉ in trạng thái/mã lỗi.
- `server/test/care-assistant-ai.test.js`: chuyển mock sang Chat Completions và bổ sung test lỗi Groq.
- `mobile/lib/screens/assistant/care_assistant_screen.dart`: thông báo dữ liệu gửi tới Groq.
- `mobile/test/care_assistant_test.dart`: kiểm tra thông báo Groq.
- `mobile/CARE_ASSISTANT.md`: cấu hình, hạn mức, điều khoản dữ liệu, lệnh và kết quả.
Không cần thay package.json/lockfile trong lượt này; tái sử dụng SDK đã cài. Các thay đổi từ các lượt trước được giữ nguyên.
## Flutter Web localhost:63002 — sửa kết nối auth

Backend từng không lắng nghe port 5000 (ECONNREFUSED); chỉ còn nodemon không có server con. Đã thay tiến trình giám sát không còn server bằng một backend duy nhất, xác nhận GET / trả 200 và SQL Server kết nối thành công. Không tạo tài khoản thử nghiệm hoặc sửa database.

Tiến trình Flutter Web hiện có đã dùng API_BASE_URL localhost:5000. Mặc định ApiClient trước đây là IP Android Emulator cho mọi nền tảng; nay Web mặc định http://localhost:5000/api, native giữ http://10.0.2.2:5000/api. --dart-define vẫn được ưu tiên và cần chạy lại Flutter khi thay đổi.

Khởi động lại phiên Flutter Web hiện tại (dừng phiên cũ trước để giải phóng port):

```powershell
cd mobile
flutter run -d chrome --web-port=63002 --dart-define=API_BASE_URL=http://localhost:5000/api
```

Backend hiện đã chạy, không khởi động thêm một backend trên cùng port. server.js đọc server/.env bằng đường dẫn tuyệt đối theo file entry, không phụ thuộc thư mục chạy lệnh.

CORS development/test cho phép http/https localhost, 127.0.0.1 và [::1] ở các port. Production không mặc định cho phép localhost: đặt NODE_ENV=production và CORS_ORIGINS thành danh sách origin chính xác, ví dụ https://care.example.com,https://admin.example.com. Không dùng wildcard, không tắt bảo mật browser; các route vẫn giữ JWT/phân quyền. Request native không có Origin tiếp tục hoạt động. Khi thêm origin vào .env cần khởi động lại backend hiện có.

Xác minh thật với Origin http://localhost:63002:
- OPTIONS /api/auth/login và /api/auth/register: 204, allow-origin khớp và cho phép Content-Type/Authorization.
- POST hai route với JSON rỗng: 400/MISSING_FIELDS; không ghi dữ liệu.
- Kiểm tra fetch ngay trong tab Chrome hiện có: cả hai route trả 400/MISSING_FIELDS, không bị trình duyệt chặn bởi CORS.
- ApiException giữ message và status HTTP từ backend; thêm thông báo 400/409 khi không có message. Lỗi không kết nối không có HTTP status và được báo riêng.
Chưa thử đăng nhập thành công với tài khoản thật hoặc đăng ký tài khoản mới; phép kiểm tra không dùng mật khẩu/token.

File sửa riêng lượt kết nối Web: server/src/server.js, server/src/app.js, server/src/middlewares/cors.middleware.js, server/.env.example, server/test/cors.test.js, mobile/lib/services/api_client.dart, mobile/test/api_client_test.dart và tài liệu này. Code chatbot và thay đổi chưa commit được giữ nguyên; không reset/commit/push.

Kiểm thử: backend 93/93 pass; Flutter 25/25 pass; flutter analyze --no-pub: No issues found.
Test bổ sung lutter test --platform chrome test/api_client_test.dart --no-pub không hoàn tất, dừng ở loading test harness và đã hủy; không tính là pass. Kiểm tra request thật trong tab Flutter Web localhost:63002 đã hoàn tất như trên.

## Sửa lời chào bị dự phòng dù script Groq thành công

Đã tái hiện bằng đăng nhập demo qua HTTP API thật: /auth/login trả 200, /care-assistant/status báo cấu hình đủ, nhưng “Xin chào” trả functional/ai_unavailable. Mã upstream đã xác minh là HTTP 400/tool_use_failed. Backend không thiếu khóa/model, lỗi này không phải lỗi đồng ý sử dụng AI.

Nguyên nhân: lời chào bị buộc tool_choice=required và đưa cả danh sách công cụ, khiến Groq lỗi sinh tool call. Script cũ kiểm tra lịch giả lập với một công cụ cụ thể nên không bao phủ lỗi đó. Cả hai dùng cùng Groq client/base URL, timeout tổng 20 giây và schema Chat Completions; sự khác biệt ở loại câu hỏi, công cụ và repository thật so với giả lập.

Sửa:
- Lời chào, cảm ơn, hỏi khả năng trợ lý và câu tiếp nối trò chuyện chung trả AI trực tiếp, không cung cấp công cụ và không đọc dữ liệu hồ sơ. Vẫn kiểm tra tài khoản đang hoạt động sau khi AI trả lời.
- Câu hỏi dữ liệu cá nhân vẫn yêu cầu công cụ mới và kiểm tra phạm vi hồ sơ. “Bạn có thể giúp tôi xem lịch khám tiếp theo?” vẫn gọi công cụ lịch khám, không bị coi là trò chuyện chung.
- Lịch sử vẫn giới hạn 8 tin/6000 ký tự; không lưu ở backend, không tự retry.
- Dự phòng giữ mode=functional. aiFailureCode chỉ gồm mã cố định như AI_TOOL_GENERATION_FAILED, AI_TIMEOUT, AI_RATE_LIMITED, AI_HTTP_401; không trả lỗi SDK/body/headers/câu hỏi/kết quả công cụ. UI giải thích lý do tương ứng, không đổi nhãn thành AI.
- Status endpoint đã xác thực cho phép kiểm tra cấu hình runtime: aiConfigured, provider, model, keyConfigured. Backend phải restart khi sửa .env; script đọc .env mới không chứng minh tiến trình cũ đã nạp lại.
- Không tìm thấy cổng đồng ý AI trong code app/backend hiện tại; màn hình vẫn thông báo dữ liệu cần thiết gửi tới Groq. Không bỏ qua một điều kiện đồng ý nào. Điều kiện đăng ký hiện có được giữ nguyên.

Kiểm tra full API (opt-in, gọi Groq thật; dùng mật khẩu demo SEED_PASSWORD sẵn có, không chạy seed):

    cd server
    node scripts/check_care_assistant_api.js

Script đăng nhập caregiver01, gọi status trên backend đang chạy, gửi “Xin chào” rồi “Bạn vừa giới thiệu những gì?” cùng lịch sử qua POST /api/care-assistant/chat. Không chọn hồ sơ hoặc hỏi dữ liệu sức khỏe. Token/mật khẩu/câu trả lời chỉ nằm trong bộ nhớ; đầu ra chỉ có status/config không bí mật/mode/mã lỗi. Đăng nhập có thể tạo nhật ký demo theo luồng auth hiện có. Exit 0: cả hai câu trả mode=ai; 1: lỗi/dự phòng; 2: thiếu mật khẩu demo. Không nằm trong test tự động.

Đã kiểm tra thật: runtime provider=groq, model=openai/gpt-oss-20b, keyConfigured=true; demo login 200; lời chào và tiếp nối đều HTTP 200/mode=ai/modeReason=null; script trả OK_GREETING_AND_FOLLOWUP. Đây là full HTTP API qua JWT/controller/quyền DB/service/Groq, khác script repository giả lập cũ. Không in token hoặc dữ liệu riêng tư.

Kết quả mock: backend 99/99 pass; Flutter 26/26 pass; analyze không có vấn đề. Không chạy lại test Chrome bị kẹt ở lượt trước. Chưa xác minh toàn bộ hội thoại sức khỏe với dữ liệu thật hoặc thiết bị Android/iOS.

File sửa trong lượt này:
- server/src/services/careAssistant.ai.js
- server/src/controllers/careAssistant.controller.js
- server/scripts/check_care_assistant_api.js (mới)
- server/test/care-assistant-ai.test.js
- server/test/care-assistant.test.js
- mobile/lib/models/care_assistant.dart
- mobile/test/care_assistant_test.dart
- mobile/CARE_ASSISTANT.md

Giữ thay đổi chưa commit trên nhánh minh; không reset/clean/commit/push.