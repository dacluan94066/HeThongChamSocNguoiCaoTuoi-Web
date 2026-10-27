# CareSenior — Hoàn tất Google Web, Giai đoạn 5

Ngày thực hiện: 27/10/2026. **READY WITH LIMITATIONS**.

Đã triển khai Google Login Web cho NguoiCaoTuoi và luồng tự liên kết sau khi xác minh mật khẩu CareSenior. Người dùng đã phê duyệt riêng thay đổi Backend dùng chung: bỏ tự liên kết GoogleSubject chỉ bằng email, trả GOOGLE_LINK_REQUIRED cho tài khoản đã có nhưng chưa liên kết. Không sửa Flutter hoặc schema.

## Cách sử dụng trên Web

**Đã liên kết:** tại Đăng nhập, chọn Tiếp tục với Google, sau đó chọn tài khoản qua nút chính thức của Google. Backend xác minh và đăng nhập đúng UserID theo subject đã lưu. AuthContext tiếp tục tải `/auth/me` và quyền như đăng nhập mật khẩu, rồi đưa NCT vào `/ca-nhan`.

**Chưa liên kết:**

1. Google Login hiển thị hướng dẫn; không phát JWT và không tạo tài khoản mới.
2. Đăng nhập bằng tên đăng nhập/email/SĐT và mật khẩu CareSenior hiện có.
3. Mở Hồ sơ → Liên kết Google.
4. Nhập mật khẩu CareSenior hiện tại, chọn Google bạn sở hữu bằng nút Google.
5. Chờ trạng thái Đã liên kết Google do Backend trả sau commit. Có thể đăng nhập bằng Google trên Web và Mobile với cùng tài khoản/hồ sơ.

Sai mật khẩu hoặc Google đã thuộc tài khoản khác sẽ bị từ chối. Không có chức năng tự thay thế/hủy liên kết Google hiện tại trong phạm vi này. Email tài khoản và hồ sơ không bị đổi theo email Google; email không phải bằng chứng để tự liên kết.

SDK chỉ được tải sau thao tác chủ động khi cấu hình hợp lệ. Không chạy One Tap, không tự chọn tài khoản, không tự đăng nhập sau refresh. Hủy/rời trang/đổi phiên bỏ qua callback cũ. Nếu chưa xác định kết quả liên kết do mất mạng, timeout hoặc 5xx, không tự gửi lại; có nút Kiểm tra trạng thái liên kết.

## API thực tế

Tiền tố `/api/auth/google/web`:

| Method/path | Quyền và hợp đồng |
|---|---|
| GET `/config` | Public, chỉ trả public Web clientId; không có client secret |
| POST `/login/challenge` | JSON `{}`; trả challengeId, nonce, expiresAt, clientId và cookie ràng buộc trình duyệt |
| POST `/login` | `{challengeId,idToken}`; chỉ đăng nhập NCT hoạt động theo sub đã liên kết; JWT/user theo hợp đồng CareSenior cũ |
| GET `/status` | JWT NCT hiện tại; chỉ `{linked:boolean}`, không lộ GoogleSubject/hash/token |
| POST `/link/challenge` | JWT NCT hiện tại + JSON `{}`; challenge ràng buộc đúng UserID |
| POST `/link` | JWT NCT + `{challengeId,idToken,currentPassword}`; xác minh cả hai và trả `{linked:true}` sau commit |

Không nhận userId/elderlyId/email/role làm mục tiêu liên kết. Trường ngoài allowlist bị từ chối. Không truyền proof hoặc token trên URL.

Mobile giữ POST `/api/auth/google` và request/response đăng ký hiện tại. Returning identity được tìm bằng subject trước; chỉ khi không có subject mới kiểm tra email để ngăn tạo trùng hoặc yêu cầu liên kết có xác minh. Không còn UPDATE GoogleSubject vì email trùng.

## Bảo vệ xác thực

- Tái sử dụng google-auth-library đang cài để xác minh chữ ký, issuer, audience, exp/iat; vẫn yêu cầu email_verified thật. Không giải mã JWT rồi tự tin payload. Subject còn được so khớp chính xác sau truy vấn để collation SQL không làm lẫn hai định danh.
- Web yêu cầu nonce nằm trong Google ID token đã xác minh, khớp challenge. Mobile không bị áp thêm nonce bắt buộc vì SDK Mobile hiện tại không gửi nonce này.
- Popup GIS callback được gửi JSON qua API. Không giả định callback JS tự cung cấp cơ chế CSRF của chế độ GIS redirect POST. Web dùng Origin allowlist + challenge nonce dùng một lần + cookie HttpOnly ràng buộc trình duyệt; link còn ràng buộc account JWT và mục đích.
- Challenge tồn tại tối đa 5 phút trong RAM, bị xóa đồng bộ trước khi await xác minh. Sai cookie/origin/purpose/account, hết hạn hoặc replay đều bị từ chối. Có giới hạn bộ nhớ và rate limit 10 lần/phút theo IP, thêm theo tài khoản cho link; không tạo worker hay bảng.
- Cookie binding tồn tại 10 phút, không phải cookie đăng nhập và không chứa danh tính/token. Production dùng `__Host-caresenior-google`, Secure, HttpOnly, SameSite=Lax, Path=/ và không Domain. Dev dùng cookie host-only cùng thuộc tính trừ Secure.
- Chỉ nhóm Google Web được bật CORS credentials; CORS của các API/socket cũ giữ nguyên. GOOGLE_WEB_ORIGINS nếu cấu hình là allowlist chính xác, không mở fallback localhost ngoài danh sách đó. Production yêu cầu HTTPS.
- Mật khẩu được so bằng bcrypt theo cùng ngữ nghĩa đăng nhập hiện tại, gồm mật khẩu Unicode cũ. Không đặt quy tắc loại bỏ mới ở mốc 72 byte. Payload xác minh vẫn được giới hạn kích thước.
- Sau khi xác minh Google, transaction recheck role/trạng thái/hash mật khẩu, khóa hàng và subject bằng UPDLOCK/HOLDLOCK; không thay liên kết khác và không dùng subject đã thuộc UserID khác. UPDATE có điều kiện GoogleSubject IS NULL, hash hiện tại, trạng thái hoạt động và kiểm tra rowsAffected=1. Xung đột/duplicate/deadlock rollback, không tự retry. Cùng binding đã có được xử lý idempotent.
- Web xác minh Google có deadline 15 giây. Kết quả verifier đến muộn sau timeout không được tiếp tục tạo session/ghi liên kết. UI gọi API với timeout 30 giây và không retry ngầm.
- Google proof lỗi ở link trả 422, khác với JWT CareSenior hết hạn trả 401 từ auth middleware. Sai mật khẩu 403 không làm mất phiên CareSenior. Google login public bị từ chối không xóa phiên mới hơn đang có.
- Chỉ lưu JWT/user CareSenior theo cơ chế cũ. Không lưu Google ID token, mật khẩu, challenge hoặc nonce vào localStorage/sessionStorage/URL/SQL log. Mật khẩu và attempt được dọn khi gửi, hủy, hết hạn, unmount hoặc đổi phiên. Google callback cũ không thể ghi đè tài khoản mới.
- Morgan bỏ log URL các route Google; JSON parser/error handler cũng redaction Google, không in token/password/stack chứa body. SQL/SDK lỗi ngoài dự kiến trả thông báo an toàn.

Nguồn đối chiếu: [Google — verify ID tokens](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS JavaScript API, nonce và popup callback](https://developers.google.com/identity/gsi/web/reference/js-reference).

## Tác động tới Mobile

| Tình huống | Hành vi |
|---|---|
| GoogleSubject đã liên kết | Giữ UserID, profile, JWT sessionVersion 2 và log Mobile; subject vẫn nhận diện đúng khi email Google thay đổi |
| Tài khoản CareSenior có email trùng nhưng GoogleSubject rỗng | 409 GOOGLE_LINK_REQUIRED, có hướng dẫn đăng nhập mật khẩu và hoàn tất liên kết trên Web |
| Google hoàn toàn mới | Giữ hai bước requiresRegistration → form Mobile → tạo đúng một account/profile |
| Đã liên kết trên Web | Mobile đọc cùng GoogleSubject, đăng nhập cùng UserID, không tạo profile/account khác |
| Tài khoản khóa/role khác | Tiếp tục bị chặn |

Không thay đổi Dart request, GoogleSignInService, đăng ký, lưu session hoặc Google SDK trên Flutter. Mobile hiện chưa có UI liên kết riêng: người chưa liên kết cần hoàn tất trên Web một lần, đúng thay đổi đã được người dùng duyệt. Không migration dữ liệu GoogleSubject đã có; không tự đổi vai trò hay liên kết lịch sử.

## Cấu hình triển khai

- `server/.env.example` đã bổ sung hướng dẫn; **không sửa `.env` thực tế**.
- GOOGLE_WEB_CLIENT_ID vẫn là Web application client ID/audience dùng chung với Mobile. Frontend đọc public client ID qua `/config`, không có biến client ID thứ hai gây lệch audience. Không cần client secret cho luồng ID token này.
- Trong Google Cloud, Authorized JavaScript origins phải có chính xác origin Web đang dùng (ví dụ `http://localhost:5173`, đúng protocol/host/port). Không sử dụng callback redirect của authorization-code flow cho popup implementation này.
- Có thể đặt GOOGLE_WEB_ORIGINS bằng danh sách origin phân cách dấu phẩy; nếu để trống dùng CORS_ORIGINS và localhost ở development. Production cần allowlist và HTTPS.
- Web/API phải cùng site hoặc dùng reverse proxy `/api` để cookie SameSite=Lax hoạt động. Khác port được; không trộn localhost với 127.0.0.1 hay hai domain khác site. Không tự hạ bảo vệ cookie để chạy qua môi trường cross-site.
- Nếu môi trường production có CSP/COOP riêng, cần kiểm tra cho phép GIS script/popup theo tài liệu Google. Không tắt CSP hoặc bỏ bảo vệ trình duyệt trong code này.
- Schema hiện tại phải có NguoiDung.GoogleSubject và unique index đã thuộc chức năng Google cũ. Không tự thêm cột/index hoặc chạy migration nếu môi trường thiếu schema.
- Rate limit dùng IP kết nối hiện tại; nếu triển khai sau proxy phải có cấu hình trusted proxy được duyệt, không tin X-Forwarded-For tùy ý. Challenge RAM bị vô hiệu khi restart; nhiều backend instance cần sticky routing hoặc cơ chế dùng chung được duyệt riêng.

Chỉ xác nhận cấu hình client ID trong file hiện có là có giá trị và đúng dạng hỗ trợ; không in giá trị/token và không kiểm tra Google Cloud bằng tài khoản thật. Chưa tự restart Backend/worker hoặc thay cấu hình triển khai thật.

## File thay đổi

15 file có sẵn được chỉnh sửa:

| File | Mục đích |
|---|---|
| `server/src/controllers/auth.controller.js` | Bỏ email autolink Mobile, subject-first, dùng chung JWT helper với audit Web/Mobile |
| `server/src/services/googleAuth.service.js` | Web nonce bắt buộc khi truyền option; giữ Mobile verification không nonce |
| `server/src/routes/auth.routes.js` | Nhóm 6 endpoint Web, auth middleware cho status/link |
| `server/src/middlewares/cors.middleware.js` | Credentials chỉ cho Google Web, Google Origin allowlist |
| `server/src/app.js` | Không log Google URL/query |
| `server/src/middlewares/error.middleware.js` | Redact Google parser/SDK/SQL errors |
| `server/.env.example` | Hướng dẫn public client ID/origin/cookie, không thay `.env` thật |
| `frontend/src/pages/Login/LoginPage.jsx` | Google NCT, canonical AuthContext, giữ login mật khẩu |
| `frontend/src/pages/ElderlyPortal/ElderlyPersonalProfile.jsx` | Panel hoàn tất liên kết trong Hồ sơ |
| `frontend/src/services/axiosClient.js` | Tách Google login public với link protected và xử lý lỗi đúng phiên |
| `server/test/google-token-security-stage5.test.js` | Thêm nonce regression bằng SDK/RSA thật |
| `frontend/test/webSession.test.js` | Phân biệt lỗi Google proof và JWT hết hạn |
| `frontend/test/elderlyWorkspace.browser.test.js` | Express Google controller + DB RAM, fixture Chrome và thêm ca Google |
| `frontend/test/fixtures/elderlyWorkspacePreview.jsx` | Tương tác hoàn tất liên kết/đăng xuất/đăng nhập lại và callback safety |
| `frontend/test/README_elderly_web_stage5.md` | Ghi chú liên kết báo cáo bổ sung, giữ báo cáo AI/UI lịch sử |

12 file mới:

- `server/src/controllers/googleWeb.controller.js`
- `server/src/services/googleWebChallenge.service.js`
- `server/test/fixtures/google-web-fixture.cjs`
- `server/test/google-web-auth.test.js`
- `server/test/google-mobile-regression.test.js`
- `frontend/src/components/GoogleWebAuth.jsx`
- `frontend/src/components/GoogleWebAuth.css`
- `frontend/src/services/googleWebService.js`
- `frontend/src/utils/googleWebAuth.js`
- `frontend/test/googleWebAuth.test.js`
- `frontend/test/googleWebProvider.test.js`
- `frontend/test/README_google_web_stage5.md`

## Kiểm thử đã chạy

| Nhóm | Kết quả |
|---|---|
| Toàn bộ Backend | **458 PASS, 0 FAIL, 1 SKIP**; 459 test, SQL opt-in tạo DB không bật |
| Toàn bộ Frontend | **263 PASS, 0 FAIL, 0 SKIP** |
| Chrome headless fixture | **53/53 ca PASS**, trong đó 7 ca mới về Google |
| Google Web HTTP/controller | **22 PASS**, fake Google transport, SQL RAM; gồm Web link → Mobile controller dùng chung pool RAM |
| Mobile regression | **5 PASS**, controller thật + SQL mock, cả đăng ký hai bước và JWT/audit platform |
| Google SDK security | **8 PASS**, RSA/token/cert giả, SDK verification thật, fixed clock và nonce |
| Frontend Google adapter/session | **5 ca mới PASS**, không ghi token/password nhạy cảm, không retry và không ghi đè phiên mới |
| GIS callback lifecycle | **3 PASS**, gỡ handler/DOM/session references khi hủy, abort lúc script đang tải và không để owner cũ hủy owner mới |
| Cấu hình Backend đang chạy | **PASS read-only**, GET `/api/auth/google/web/config` tại localhost:5000 trả HTTP 200 và có public client ID; handler không truy vấn SQL |
| Responsive | **PASS** 360/768/1024/1440 và font DOM tới 1,8×; Google popup thực tế/iframe vendor chưa kiểm tra |
| Build/lint/diff check | **PASS**; còn 10 lint warning có sẵn và warning bundle khoảng 2,03 MB raw / 633 KB gzip |

Lượt Frontend tổng thể đầu tiên chạm timeout 300 giây của browser harness; các ca còn lại khi đó chưa chạy hết, không được báo PASS. Đã tăng thời gian cho 53 ca, dùng profile test tắt extension/background và chạy tuần tự. Không tắt web security/cookie policy hoặc bỏ assertion; lượt đầy đủ cuối đạt 263/263 sau kiểm tra cleanup callback GIS. Cũng đã chạy lại 4 ca Google onboarding ở bốn viewport sau cập nhật mô tả/ảnh nghiệm thu.

Lệnh nghiệm thu:

```powershell
# server
$env:CARESENIOR_RELATIVES_SQL_TEST='0'
node --test --test-concurrency=1 test/*.test.js

# frontend
node --test --test-concurrency=1 test/*.test.js
npm run build
npm run lint
git diff --check
```

Logs ngoài repo: `%TEMP%/caresenior-google-backend-final.log`, `%TEMP%/caresenior-google-frontend-acceptance.log`. Evidence 53 ca Chrome (JSON + PNG): `C:/Users/Admin/AppData/Local/Temp/caresenior-elderly-web-m7FJWM`; ảnh Google panel phóng chữ 1,8× ở `C:/Users/Admin/AppData/Local/Temp/caresenior-elderly-web-80acfh`. Chrome dùng process/profile tạm riêng, HTTP/Socket.IO fixture trên port ngẫu nhiên và không đọc `.env`.

Frontend fixture chạy UI App thật, API Google Express/controller thật và cookie HttpOnly thật trong Chrome. **Google Identity Services được giả lập** bằng callback synthetic; database chỉ là RAM. Các bài crypto riêng chạy Google SDK thật với khóa/certificate RSA tự sinh, không tải chứng chỉ từ Google. Không đánh đồng hai nhóm này với đăng nhập Google thực tế.

### NOT_RUN và giới hạn

- Google provider thật, Google Cloud origin/CSP/COOP thực tế, trình duyệt của người dùng và tài khoản Google thật: **NOT_RUN**.
- Flutter Google SDK trên máy/thiết bị thật: **NOT_RUN**; chỉ đọc Dart và kiểm tra Backend/protocol tương thích, không sửa Flutter.
- Ghi liên kết/transaction trên SQL Server thật (main hay Stage6): **NOT_RUN**. Lock/rollback/race đã kiểm tra bằng SQL mock, chưa phải chứng minh transaction bằng SQL Server tích hợp.
- Loa vật lý/SOS thật: **NOT_RUN**; SOS/realtime/AI/thuốc chỉ được chạy hồi quy cách ly.

Không gọi Google thật vì chưa có phiên/tài khoản kiểm thử được cấp quyền. Chỉ GET endpoint public config ở localhost:5000, không gọi login/link/challenge thật hoặc tạo dữ liệu Google/DEMO trên database chính. Không chạy SQL/patch/FINAL/seed, không tạo/xóa DB và không sửa Flutter. Những thay đổi độc lập do server/worker đang chạy không được suy ra bằng checksum dữ liệu; lượt này không dùng database thật để test.

Đối chiếu hash với baseline 88 file có thay đổi trước lượt triển khai: 9 file trong baseline được sửa đúng phạm vi Google/docs/test, 79 file còn lại giữ nguyên; không thiếu file. Có thêm 6 file tracked trước đó sạch được chỉnh sửa và 12 file mới (tổng 15 sửa, 12 tạo). AI, thuốc, SOS, realtime, timezone và toàn bộ Mobile/design_reference ngoài phạm vi được giữ nguyên.

**Kết luận:** Giai đoạn 5 **READY WITH LIMITATIONS**. Chức năng Google Web và đường hoàn tất liên kết đã có; cần nghiệm thu provider thật và môi trường triển khai được cấp quyền trước khi tuyên bố Google production login PASS. Không tự triển khai Giai đoạn 6, commit, push, reset hoặc clean.
