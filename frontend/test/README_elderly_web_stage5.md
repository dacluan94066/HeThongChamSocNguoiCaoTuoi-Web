# CareSenior — Web Người cao tuổi, Giai đoạn 5

> Báo cáo này ghi nhận lượt AI/UI ban đầu. Sau phê duyệt riêng của người dùng, Google Web và liên kết an toàn đã được triển khai; xem [báo cáo bổ sung Google Web](README_google_web_stage5.md). Kết quả và trạng thái dừng Google bên dưới là lịch sử của lượt trước.

Ngày thực hiện: 27/10/2026.

AI/UI hoàn thành trong phạm vi được duyệt. Google Web **dừng riêng theo điều kiện bảo mật của yêu cầu**, chưa được triển khai. Không xem việc test token bằng SDK là đã đăng nhập Google Web thành công.

## Chức năng AI và UI

- Thay placeholder `/ca-nhan/tro-ly` bằng giao diện chat trong luồng trang, không dùng overlay che nội dung. Lối tắt Hỏi AI nằm trong Header, ẩn trên màn SOS. Giữ nguyên năm mục điều hướng và hai tab Lịch trình.
- Nhập tối đa 500 ký tự, Enter gửi, Shift+Enter xuống dòng, bảo vệ lúc IME đang nhập. Có nhãn input, trạng thái đang xử lý, role log/live region, lỗi riêng và nút dừng chờ.
- Tạo/chuyển/xóa hội thoại với xác nhận xóa. Đóng/mở chat bằng điều hướng giữ dữ liệu trong cùng workspace. Đổi hội thoại khi đang chờ sẽ hủy chờ và bỏ qua phản hồi đến muộn, không tự gửi lại.
- Markdown giới hạn: đoạn văn, danh sách, chữ đậm, inline code, code block dạng văn bản. React escape toàn bộ HTML; không thực thi HTML/JavaScript, không tải ảnh và không biến URL của AI thành liên kết hoạt động.
- Phân biệt nhãn AI và Tra cứu theo chức năng theo `mode` thực tế Backend. Thiếu cấu hình AI hoặc AI không khả dụng được thông báo rõ; không tạo câu trả lời AI giả khi timeout/mất mạng.
- Tái sử dụng Header/avatar dữ liệu thật; menu Hồ sơ, Đổi mật khẩu, Đăng xuất, focus và Escape. Hồ sơ và Header dùng một instance hộp thoại đổi mật khẩu hiện có, tránh hai form trùng ID; không sửa API hay validation mật khẩu.
- Giữ phong cách xanh CareSenior, bố cục hai cột trên desktop rộng, toolbar hội thoại trên màn nhỏ, nội dung và composer cuộn trong luồng trang. Không đặt chat/FAB lên nút SOS hoặc Bottom Navigation.

## API và quyền

Đã đọc routes, controller, repository, scoped tools, AI service và context signing hiện có trước khi tích hợp.

| Endpoint thực tế | Cách sử dụng |
|---|---|
| GET `/api/care-assistant/profiles` | Kiểm tra đúng một hồ sơ của NCT đang đăng nhập; không tạo bộ chọn hồ sơ khác |
| GET `/api/care-assistant/status` | Trạng thái cấu hình AI; không vô hiệu hóa tra cứu app khi model chưa cấu hình |
| POST `/api/care-assistant/chat` | Câu hỏi, own elderlyId, history và conversationToken; timeout client 45 giây, không retry tự động |
| POST `/api/care-assistant/query` | Đã rà soát hợp đồng tra cứu chức năng; không gọi thêm như fallback vì `/chat` đã điều hướng và fallback tại Backend |

Backend hiện có xác thực JWT, recheck account/role, mobile-scope theo UserID, kiểm tra quyền QLHOSONCT xem và scoped repository đọc dữ liệu. Các kiểm tra này áp dụng theo role NCT, không yêu cầu giả platform mobile. Không thêm endpoint, role, quyền hoặc hệ thống AI thứ hai.

Frontend chỉ chấp nhận response đúng `profile.id`, mode và text hợp lệ; không render raw `rows`. APP/HEALTH/OUT_OF_SCOPE do Backend quyết định. Không thay classifier, system prompt hoặc RAG. Không tự chọn intent theo từ khóa phía Web.

Action chỉ được ánh xạ bằng bảng cố định tới route `/ca-nhan`: thuốc, khám, sức khỏe, hồ sơ/người chăm sóc, thông báo và màn SOS. Bỏ action lạ, URL ngoài và action ghi dữ liệu. Link chỉ chạy khi người dùng nhấn; không tự gọi API ghi, xác nhận thuốc hoặc gửi SOS. Action nhật ký chưa có màn Web riêng nên không tạo chức năng mới.

## Vòng đời lịch sử trong phiên

- Store RAM ở cấp workspace, riêng theo tài khoản/hồ sơ. Tối đa 12 hội thoại, mỗi hội thoại tối đa 40 tin nhắn để giới hạn bộ nhớ.
- Gửi tối đa 8 lượt history và 6.000 ký tự theo hợp đồng Backend; assistant turn tối đa 2.200, user turn tối đa 500. Lượt thất bại không được gửi như câu trả lời đã có.
- Context token được giữ riêng trong RAM từng hội thoại, không gửi lại sau 25 phút. Backend vẫn xác minh chữ ký, account/profile và hạn 30 phút. Invalid context yêu cầu người dùng chủ động tạo hội thoại mới, không tự retry.
- Token/user Web hiện có vẫn do cơ chế đăng nhập cũ quản lý. Không ghi câu hỏi, câu trả lời, draft, tên hội thoại hoặc context token vào localStorage/sessionStorage/URL/SQL/log.
- Đăng xuất, đổi tài khoản và 401 dọn store/hủy chờ; response cũ bị chặn bởi session revision và generation. Deadline `exp` chỉ được đọc phía client để **xóa cache chat**, không dùng để cấp quyền hoặc thay đổi xác thực JWT. Timer có xử lý giới hạn delay 32 bit; hết hạn khi đang ở trang khác vẫn xóa hội thoại.
- Refresh hoặc đóng trình duyệt không hứa khôi phục chat; không đồng bộ với Mobile, không triển khai lịch sử bền vững hoặc Web Push.

## Google: điểm phải được duyệt riêng

`server/src/controllers/auth.controller.js` hiện có `/auth/google` dùng chung với Flutter:

1. Tìm người dùng bằng `GoogleSubject=@googleSubject OR Email=@email` (khoảng dòng 590).
2. Nếu chưa có GoogleSubject thì UPDATE gán subject khi email khớp (khoảng dòng 628–639), không có bước xác minh lại mật khẩu CareSenior.
3. Luồng này tạo session Mobile và còn có nhánh đăng ký mới. Flutter gọi cùng endpoint trong `mobile/lib/services/auth_service.dart`.

Vì vậy đưa Web vào luồng này sẽ trái yêu cầu không tự liên kết bằng email. Đổi chính sách dùng chung có thể ảnh hưởng Mobile, thuộc đúng điều kiện phải dừng và xin duyệt riêng. Lượt này **không sửa Google controller/service, LoginPage, JWT hoặc Flutter** và không gắn nút GIS vào endpoint này.

Đề xuất cần duyệt: Web chỉ đăng nhập theo subject đã liên kết; tài khoản chưa liên kết phải đăng nhập CareSenior và xác minh lại quyền sở hữu bằng mật khẩu hiện tại trước khi liên kết Google. Đồng thời phải chốt chính sách cho nhánh Mobile tự liên kết email đang tồn tại; thêm một endpoint Web riêng không tự loại bỏ rủi ro của endpoint dùng chung cũ. Không tự tạo tài khoản/hồ sơ thứ hai. Cần duyệt phạm vi thay đổi authentication/Mobile nếu có, cấu hình Web client/origin và kiểm thử GIS bằng tài khoản được cấp quyền.

Test mới dùng **Google SDK đang cài thật**, RSA key/token giả và public certificate trong RAM; không gọi Google hoặc SQL. Đã kiểm tra audience, issuer, chữ ký, expiry/iat theo clock cố định, email_verified và không lộ token qua lỗi. Đây chỉ là test lớp verifier, không phải test liên kết tài khoản/Google Login thực tế.

## File trong lượt này

Sửa 6 file có sẵn (đang là untracked từ các giai đoạn trước):

| File | Mục đích |
|---|---|
| `frontend/src/pages/ElderlyPortal/ElderlyPortalPage.jsx` | Store chat theo workspace, Header AI/menu, dùng chung modal mật khẩu |
| `frontend/src/pages/ElderlyPortal/ElderlyPortal.css` | AI shortcut trong Header, menu tài khoản |
| `frontend/src/pages/ElderlyPortal/ElderlyPersonalProfile.jsx` | Nút mật khẩu dùng lại modal cấp workspace, giữ luồng form hồ sơ |
| `frontend/src/pages/ElderlyPortal/ElderlyWorkspaceScreens.jsx` | Export màn AI thay placeholder |
| `frontend/test/elderlyWorkspace.browser.test.js` | API RAM và các ca Chrome mới |
| `frontend/test/fixtures/elderlyWorkspacePreview.jsx` | Thao tác chat/header/session/responsive trong App thật |

Tạo 8 file:

- `frontend/src/pages/ElderlyPortal/ElderlyAssistant.jsx`
- `frontend/src/pages/ElderlyPortal/ElderlyAssistant.css`
- `frontend/src/pages/ElderlyPortal/AssistantMarkdown.jsx`
- `frontend/src/utils/elderlyAssistant.js`
- `frontend/src/services/elderlyAssistantService.js`
- `frontend/test/elderlyAssistant.test.js`
- `server/test/google-token-security-stage5.test.js` — chỉ test, không thay Backend runtime.
- `frontend/test/README_elderly_web_stage5.md`

## Cách kiểm thử cách ly

```powershell
# server: không bật test SQL tạo database
$env:CARESENIOR_RELATIVES_SQL_TEST='0'
node --test test/*.test.js

# frontend
node --test test/*.test.js
npm run lint
npm run build
git diff --check
```

Chrome là binary thật chạy **headless**, profile tạm riêng; React StrictMode và Vite không đọc `.env`, HTTP/Socket.IO RAM trên port ngẫu nhiên, không dùng Backend đang chạy ở 5000 hoặc database chính. Account switching dùng hai browsing context fixture; không truy cập phiên Chrome cá nhân. SOS/thuốc ghi vào RAM fixture duy nhất.

Responsive kiểm tra viewport trong iframe bằng `innerWidth` 360/768/1024/1440; font DOM thực tế 1,0× và 1,8×, không đánh đồng với kiểm tra zoom/OS accessibility trên thiết bị vật lý. Menu/composer có nhãn và keyboard test; chưa chạy screen reader thật.

## Kết quả nghiệm thu

| Nhóm | Kết quả thực chạy | Phạm vi/bằng chứng |
|---|---|---|
| Toàn bộ Backend | **430 PASS, 0 FAIL, 1 SKIP** | 431 test; SQL opt-in tạo database không được bật |
| Toàn bộ Frontend | **248 PASS, 0 FAIL, 0 SKIP** | Node tests gồm Chrome suite, hồi quy Người thân/SOS/timezone/session |
| Chrome fixture | **46/46 ca PASS** | 546 assertion; App thật, HTTP/Socket.IO mô phỏng trong RAM, không SQL/Groq/Google thật |
| Logic AI mới | **18/18 PASS** | Owner, history, token TTL, timeout/lỗi, phản hồi đến muộn, logout/account/session expiry, giới hạn bộ nhớ |
| Google SDK security mới | **7/7 PASS** | Token/key/certificate giả, đồng hồ cố định; signature/audience/issuer/expiry/iat/email_verified |
| Responsive/chat | **PASS** | 360/768/1024/1440, font DOM 1,0× và 1,8×, không horizontal overflow; focus composer, menu và Escape |
| Production build | **PASS** | Còn warning bundle khoảng 2,02 MB raw / 630 KB gzip |
| Lint | **PASS** | Không error/new warning; 10 warning có sẵn ở shared components |
| `git diff --check` | **PASS** | Đã kiểm tra lại sau sửa |
| GIS / Google Web đã liên kết / chống auto-link trong luồng Web mới | **NOT_RUN — chưa triển khai** | Dừng theo chính điều kiện người dùng về chính sách shared Google/Mobile |
| AI provider/tài khoản thật, đăng nhập Web/Mobile đồng thời, loa vật lý, screen reader thật | **NOT_RUN** | Không dùng credentials, phiên Chrome cá nhân hoặc dữ liệu thật để giả kết luận PASS |

Lượt toàn bộ Frontend PASS lưu tại `%TEMP%/caresenior-stage5-frontend-complete.log`; Backend tại `%TEMP%/caresenior-stage5-backend-final.log`.
Evidence 46 ca (PNG + JSON): `C:/Users/Admin/AppData/Local/Temp/caresenior-elderly-web-YFr1hp`.
Sau tinh chỉnh riêng biến màu primary scoped cho chat, đã chạy lại thêm bốn viewport AI và tất cả PASS; evidence màu cuối tại `C:/Users/Admin/AppData/Local/Temp/caresenior-elderly-web-yRIaz7`. Build/lint được chạy lại cho trạng thái source cuối.

Các ca chat gồm APP/HEALTH/OUT_OF_SCOPE qua HTTP fixture, context khác hồ sơ, response khác hồ sơ, lỗi 503/mất mạng, AI chưa cấu hình, new/select/close/reopen, Markdown độc hại, chỉ điều hướng SOS, pending response sau new chat/account switch, 401 dọn phiên và timer hết phiên khi trang chat đã đóng. Backend classification/scope/repository chỉ đọc, SOS hold, Socket.IO, thuốc và bốn role được kiểm tra hồi quy bằng các test sẵn có; không đánh đồng fixture với đăng nhập trên database chính.

Kiểm tra thay đổi bằng SHA256 so với baseline ngoài repository ở đầu lượt: 80 file dirty/untracked có sẵn; chỉ 6 file UI/test đã liệt kê thay đổi, 74 file còn lại nguyên hash, không thiếu file. Thêm đúng 8 file Stage5 đã liệt kê. Các file Backend runtime, Google/auth/Login, Flutter và SQL giữ nguyên so với đầu lượt; những diff Backend có sẵn thuộc giai đoạn trước không bị hoàn tác.

**Kết luận:** AI/UI **READY WITH LIMITATIONS**. Giai đoạn 5 đầy đủ gồm Google Web **NOT READY** vì chính sách liên kết Google cần được phê duyệt riêng trước khi triển khai. Không tự chuyển Giai đoạn 6.

## An toàn và giới hạn

- Không gọi Google/Groq thật để nghiệm thu; Google GIS, đăng nhập thật bốn role và AI provider thật: NOT_RUN.
- Không kiểm tra loa vật lý/Chrome có giao diện người dùng trong lượt này; SOS Socket.IO/hold/âm thanh hồi quy theo các fixture sẵn có, không gửi SOS thật.
- Không chạy SQL, migration, seed, FINAL hoặc tạo/xóa database. Không truy vấn database chính để khẳng định dữ liệu bất biến khi worker vẫn có thể hoạt động độc lập; thao tác của lượt này không kết nối hoặc ghi database chính.
- Backend runtime, authentication, classifier/prompt, clinical APIs, Mobile và SQL scripts không được sửa trong lượt này. Endpoint staff `/medication-schedules/:id/status` là rủi ro cũ được giữ nguyên theo chỉ dẫn; cần nghiệm thu riêng ở Giai đoạn 6.
- Lint còn warning có sẵn ở shared components; bundle production lớn là hạn chế có sẵn. Không tự tái cấu trúc toàn ứng dụng để sửa trong giai đoạn này.
- Không commit/push/reset/clean và không chuyển sang Giai đoạn 6.
