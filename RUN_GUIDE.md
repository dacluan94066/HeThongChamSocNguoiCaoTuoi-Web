# Hướng dẫn chạy backend và mobile

Cập nhật 10/10/2026. Chạy trên nhánh `minh`, giữ source hiện tại. Các khối `powershell` là lệnh; khối `dotenv` chỉ là nội dung file, không nhập vào PowerShell.

**Trạng thái bản cuối:** APK `app-chat-layout-debug.apk` đã build, nhưng bản bố cục chatbot cuối chưa thử thành công trên điện thoại vì `INSTALL_FAILED_USER_RESTRICTED`. Những kết quả chạy USB của `app-usb-device-debug.apk` bên dưới thuộc bản trước, không chứng minh APK cuối. Chi tiết cài lại an toàn nằm ở cuối tài liệu.

## Bản APK mới và backend tương ứng

Kiểm tra USB mới nhất 10/10/2026: thiết bị **23129RAA4G / 51330c42**, Android 15/API 35. `flutter run` từ bản sao source không dấu đã build/cài/mở thành công, có Dart VM Service và màn hình đăng nhập hiển thị. Kiểm tra GET chỉ đọc trong tiến trình Flutter nhận HTTP 200 qua USB reverse; URL compile là `http://127.0.0.1:5000/api`. Không đăng nhập tài khoản thật hoặc ghi dữ liệu. Không có lỗi fatal/unhandled trong log kiểm tra; chưa xác minh các luồng sau đăng nhập trên điện thoại.

APK đúng bản vừa chạy trên điện thoại: **mobile/build/app/outputs/flutter-apk/app-usb-device-debug.apk** (Android arm64, 157.171.009 byte). Các APK trước vẫn được giữ nguyên. Bản sao source phiên này: `C:\Users\MINH\AppData\Local\Temp\elderly-defense-20261010`.

| APK trong mobile/build/app/outputs/flutter-apk | URL biên dịch | Backend/database |
|---|---|---|
| app-backend-debug.apk | http://127.0.0.1:5000/api | Backend app chạy src/server.js, SQL/database từ server/.env hiện có |
| app-sql-test-debug.apk | http://127.0.0.1:5059/api | Chỉ kiểm thử: Express và SQL Server thật trên database riêng, toàn bộ tài khoản/dữ liệu giả |
| app-defense-debug.apk | http://127.0.0.1:5059/api | APK kiểm thử cũ được giữ nguyên; chưa có giao diện sửa/xóa nhật ký mới |

Server kiểm thử 5059 **không phải HTTP server mock**: dùng controller/middleware/service thật và SQL Server thật, chỉ tách database, JWT và dữ liệu giả lập. Không sử dụng server này làm backend app. Mock chỉ dùng trong unit/widget test và repository giả lập của script kiểm tra Groq.

Backend app đã kiểm tra HTTP 200, kết nối pool SQL và preflight auth 204. Không đăng nhập tài khoản người thật hoặc ghi dữ liệu app để kiểm thử. Giai đoạn build ban đầu chưa có điện thoại; lần kiểm tra USB sau đó được ghi riêng ở trên. Build APK không chứng minh thao tác Android thực tế.

Thư mục chạy: `mobile/`. Server app 5000 phải đang hoạt động; kiểm tra cổng trước khi npm start ở server/. Hai APK có cùng applicationId nên bản cài sau thay thế bản trước; đăng xuất khi đổi backend.

```powershell
adb reverse tcp:5000 tcp:5000
adb install -r build/app/outputs/flutter-apk/app-backend-debug.apk
```

Nếu chạy source với backend app, thư mục `mobile/`:

```powershell
$deviceId='THAY_BANG_ID_TRONG_FLUTTER_DEVICES'
flutter run -d $deviceId --dart-define=API_BASE_URL=http://127.0.0.1:5000/api
```

Wi-Fi backend app: thay 127.0.0.1 bằng IP LAN máy tính và vẫn dùng cổng 5000; cần build/run lại với dart-define. Chỉ mở cổng development trên mạng Private. Các thao tác ghi/SOS trong kịch bản bảo vệ tiếp tục dùng bản kiểm thử 5059 với dữ liệu giả.

## API SOS và nhật ký đã bổ sung

- PATCH /api/emergency-alerts/:id/seen; PATCH /api/emergency-alerts/:id/resolve, body resolve: `{"ghiChu":"Kết quả xử lý"}`.
- SOS: DangGui → DaTiepNhan → DaXuLy. CanhBao liên quan: ChuaXuLy → DaXem → DaXuLy. Cả hai cập nhật cùng transaction, lưu người/thời điểm xử lý. API alerts/:id/seen và resolve cũ dùng cùng workflow, không tạo trạng thái riêng.
- Caregiver phải đang làm việc, được phân công còn hiệu lực; Admin được xử lý. BacSi chỉ khi PhanQuyen cho phép sửa QLCANHBAO (BIT true/1); false/0 bị từ chối. Không cho người cao tuổi xử lý SOS.
- SOS cũ chưa có CanhBao được đọc trực tiếp từ SOS; liên kết được tạo trong transaction khi xử lý đúng quyền. Không chạy backfill/migration trên database app, không ghi đè lịch sử đã kết thúc.
- PATCH /api/care-notes/:id: body `{"version":"GIÁ_TRỊ_64_KÝ_TỰ_TỪ_GET","tieuDe":"Tiêu đề","noiDung":"Nội dung"}`. DELETE cùng URL: body `{"version":"GIÁ_TRỊ_TỪ_GET"}`.
- GET care-notes trả version và canEdit. Chỉ người viết còn được phân công hoặc Admin được sửa/xóa; caregiver khác và BacSi không được sửa/xóa. Xóa mềm bằng TrangThai=HUY có sẵn; bản ghi gốc giữ lại và không xuất hiện trong danh sách/chatbot.
- Version kiểm tra xung đột từ dữ liệu hiện tại, không thêm cột. HTTP 409 giữ nội dung nhập trong form; cần đọc lại bản ghi trước khi lưu, không bấm thử lại liên tục với version cũ.
- Không cần migration: đã kiểm tra đọc trên schema app rằng cột SOS người/thời điểm xử lý và CHECK HUY của nhật ký tồn tại.

## Môi trường

- Node.js và npm; SQL Server có TCP/IP và SQL Authentication; Flutter SDK, Android SDK và JDK.
- Máy kiểm tra: Node 24, Flutter 3.38.5/Dart 3.10.4, Android SDK 36.1, Java 21. Thiết bị Android 51330c42 đã kết nối trong lần kiểm tra USB; cài APK bố cục cuối đang bị điện thoại chặn.
- Đưa Node/Flutter/adb vào PATH hoặc dùng đường dẫn cài đặt. Trên máy hiện tại: Node ở `D:\1.Download\Node.js`, Flutter ở `C:\tools\flutter\bin`, adb ở `D:\Android\Sdk\platform-tools`.
- Các thư mục chạy bên dưới tính từ thư mục gốc repository.

## Backend thông thường

Thư mục chạy: `server/`.

```powershell
npm ci
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
```

Chỉ chạy lệnh Copy-Item nếu chưa có .env; giữ file cấu hình đang dùng. Tự điền thông tin kết nối và bí mật trong `server/.env`. Ví dụ **nội dung file**, các ô trống phải tự cấu hình:

```dotenv
DB_SERVER=localhost
DB_DATABASE=QLSucKhoeNguoiCaoTuoi
DB_USER=
DB_PASSWORD=
DB_PORT=1433
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
JWT_SECRET=
JWT_EXPIRES_IN=7d
PORT=5000
NODE_ENV=development
CORS_ORIGINS=
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
```

SQL Server phải có database/schema tương ứng. File `QLSucKhoeNguoiCaoTuoi_FINAL.sql` là nguồn schema; không chạy nguyên file lên database hiện có vì có phần DROP/CREATE DATABASE. Bản kiểm thử bên dưới tự tạo database mới và chỉ lấy các batch DDL an toàn; không migration hoặc ghi vào database app.

Thư mục chạy: `server/`. Kiểm tra cổng trước, chỉ khởi động nếu chưa có backend:

```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
npm start
```

Restart backend sau khi đổi .env. Flutter không đọc server/.env và không chứa khóa AI.

## Database và backend kiểm thử SQL riêng

Không dùng tài khoản người thật để trình diễn thao tác ghi/SOS. Thư mục chạy: `server/`.

```powershell
node scripts/verify_assistant_positive_api.js --fixture-only
```

Lệnh tạo một database mới `CareAssistant_Test_<timestamp>_<hex>`, hai hồ sơ TEST ONLY A/B và một caregiver giả; thuốc/lịch khám tính theo ngày chạy. Không đọc/ghi database app ở chế độ này. Cần quyền CREATE DATABASE trên SQL Server. Ghi lại tên database được in ra; không xóa database cũ.

Thư mục chạy: `server/`. Thay tên ví dụ bằng tên vừa tạo; mật khẩu chỉ nhập qua lời nhắc trên máy, không ghi vào tài liệu hoặc .env:

```powershell
$env:MOBILE_TEST_DATABASE='CareAssistant_Test_1791618532545_240159'
$demoSecret=Read-Host 'Mat khau demo tu dat (it nhat 8 ky tu)' -AsSecureString
$demoPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($demoSecret)
try {
  $env:MOBILE_TEST_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($demoPtr)
  node scripts/verify_mobile_flows.js --serve
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($demoPtr)
  Remove-Item Env:MOBILE_TEST_PASSWORD -ErrorAction SilentlyContinue
}
```

Server demo chạy cổng **5059**, database giả lập, JWT riêng trong bộ nhớ. Tài khoản: `test.elder.a`, `test.elder.b`, `test.caregiver`; cùng mật khẩu vừa nhập. Script từ chối database app hoặc fixture có tài khoản/người nhận không đúng mẫu. Ctrl+C dừng server. Restart server đổi JWT, nên đăng nhập lại app.

Mặc định dùng trợ lý theo chức năng và không gọi Groq. Nếu muốn demo Groq với **dữ liệu giả lập**, tự cấu hình Groq trong .env và đổi lệnh cuối thành `node scripts/verify_mobile_flows.js --serve --live-ai`. Đây là thao tác gọi dịch vụ AI thật có chủ đích; không nằm trong test tự động. Lỗi/quota vẫn dự phòng, nhãn phản ánh chế độ thật. Xem thêm `mobile/CARE_ASSISTANT.md`.

## Android qua USB

APK kiểm thử mới: `mobile/build/app/outputs/flutter-apk/app-sql-test-debug.apk`. API đã biên dịch là **http://127.0.0.1:5059/api**, chỉ dùng backend/database kiểm thử SQL riêng qua USB reverse.

Thư mục chạy: `mobile/`; bật USB debugging và chấp nhận kết nối trên điện thoại:

```powershell
flutter doctor -v
flutter devices
adb devices
adb reverse tcp:5059 tcp:5059
adb install -r build/app/outputs/flutter-apk/app-sql-test-debug.apk
```

Mở app sau khi server demo đang chạy. Nếu nhiều thiết bị, thêm `adb -s <device-id>` vào các lệnh adb. Khi rút USB phải cấu hình lại kết nối; 127.0.0.1 trên điện thoại là chính điện thoại khi không reverse.

Để chạy source với USB, thư mục `mobile/`:

```powershell
flutter pub get
$deviceId='THAY_BANG_ID_TRONG_FLUTTER_DEVICES'
flutter run -d $deviceId --dart-define=API_BASE_URL=http://127.0.0.1:5059/api
```

## Android qua Wi-Fi

Máy tính và điện thoại cùng mạng LAN. Thư mục `server/`: trước lệnh --serve, đặt `$env:MOBILE_TEST_HOST='0.0.0.0'`. Server demo cho phép bind LAN chỉ trong chế độ --serve. Dùng IP LAN từ `ipconfig`; cho phép TCP 5059 trong Windows Firewall trên mạng Private nếu cần.

Thư mục `mobile/`; thay IP ví dụ bằng IP máy tính:

```powershell
$deviceId='THAY_BANG_ID_TRONG_FLUTTER_DEVICES'
flutter run -d $deviceId --dart-define=API_BASE_URL=http://192.168.1.20:5059/api
```

APK USB đã tạo không dùng trực tiếp cho Wi-Fi: phải build lại với địa chỉ LAN. Nếu chạy backend app cổng 5000, dùng 5000 thay 5059 nhưng không trình diễn SOS/thao tác ghi với dữ liệu người thật.

## Flutter Web cổng cố định

Thư mục `mobile/`, server demo 5059 đang chạy:

```powershell
flutter run -d chrome --web-hostname localhost --web-port 63002 --dart-define=API_BASE_URL=http://localhost:5059/api
```

Web mặc định dùng localhost:5000/api; Android mặc định dùng 10.0.2.2:5000/api cho emulator. Luôn truyền API_BASE_URL cho bản demo. Đây là cấu hình lúc build, đổi biến môi trường sau khi build không đổi URL trong APK.

## Build Android khi đường dẫn project có dấu

### Chạy USB từ bản sao không dấu

Đã tái hiện lỗi trên máy hiện tại: APK tồn tại, nhưng aapt 36.1.0 không đọc được đường dẫn Unicode; cùng APK chép vào TEMP không dấu đọc manifest thành công. Thông báo `No application found for TargetPlatform.android_arm64` là lỗi tiếp theo do không trích được manifest, không phải bằng chứng thiếu cấu hình Android. Không chạy `flutter create .` để xử lý lỗi này.

Thư mục chạy: gốc repository. Script sau kiểm tra đúng thiết bị/backend, sao chép code mobile hiện tại sang thư mục TEMP mới không dấu, không sao chép .env/keystore và không xóa bản gốc. Không thay SDK/Gradle/dependency. SDK paths mặc định khớp máy hiện tại; có thể truyền `-Flutter` và `-Adb` nếu cài nơi khác. Dependency phải có trong cache để pub get offline.

```powershell
powershell -ExecutionPolicy Bypass -File mobile/tools/run_android_usb.ps1 -DeviceId 51330c42
```

Script in đường dẫn bản sao, thiết lập `adb -s 51330c42 reverse tcp:5000 tcp:5000`, rồi chạy Flutter với `API_BASE_URL=http://127.0.0.1:5000/api`. Khi tiếp tục sửa code tại project gốc, chạy lại script để nhận source mới; hot reload trong phiên đó chỉ theo dõi bản sao. Script không khởi động/dừng backend, không gỡ app hoặc xóa dữ liệu điện thoại. Dùng phím `d` để rời phiên Flutter và giữ app chạy.

Máy hiện tại build được bằng bản sao source ở đường dẫn ASCII. Không reset/clean source. Thư mục chạy ban đầu: `mobile/`. Lệnh sau tạo bản sao mới và đặt build trên ổ chứa project để giảm dung lượng ổ C:

```powershell
$mobileSource=(Get-Location).Path
$demoBuildName='elderly-demo-'+[guid]::NewGuid().ToString('N')
$demoSource=Join-Path $env:TEMP $demoBuildName
$demoOutput=Join-Path $mobileSource ('build/'+$demoBuildName)
New-Item -ItemType Directory -Path $demoSource,$demoOutput | Out-Null
foreach($part in @('lib','android','assets','web')) {
  if(Test-Path -LiteralPath (Join-Path $mobileSource $part)) {
    robocopy (Join-Path $mobileSource $part) (Join-Path $demoSource $part) /E /XD build .gradle /XF local.properties /NFL /NDL /NJH /NJS
  }
}
Copy-Item pubspec.yaml,pubspec.lock -Destination $demoSource
New-Item -ItemType Junction -Path (Join-Path $demoSource 'build') -Target $demoOutput | Out-Null
Set-Location -LiteralPath $demoSource
flutter pub get --offline
flutter build apk --debug --no-pub --dart-define=API_BASE_URL=http://127.0.0.1:5000/api
Set-Location -LiteralPath $mobileSource
New-Item -ItemType Directory -Force -Path 'build/app/outputs/flutter-apk' | Out-Null
Copy-Item -LiteralPath (Join-Path $demoSource 'build/app/outputs/flutter-apk/app-debug.apk') -Destination 'build/app/outputs/flutter-apk/app-backend-debug.apk' -Force
```

Chỉ copy APK sau khi build exit 0. Offline pub get cần dependency đã cache; lần đầu dùng pub get có mạng. Không chép .env vào bản sao mobile. SDK licenses còn thiếu trên máy kiểm tra; nếu build yêu cầu, tự đọc/chấp nhận bằng `flutter doctor --android-licenses`.

## Kiểm thử và lỗi thường gặp

Thư mục `server/`:

```powershell
node --test
$env:MOBILE_TEST_DATABASE='CareAssistant_Test_1791618532545_240159'
node scripts/verify_mobile_flows.js
```

Lệnh thứ hai có thao tác ghi trong database giả lập đã xác minh, kiểm tra HTTP và đối chiếu SQL; không chạy trên database app.

Thư mục `mobile/`:

```powershell
flutter test
flutter analyze
```

- Không kết nối: kiểm tra backend đang listen, đúng /api, đúng cổng, USB reverse hoặc IP/firewall LAN. Phân biệt lỗi mạng không có HTTP status với HTTP 400/401/403/404/409.
- Hết phiên: đăng nhập lại. Mất mạng khi khôi phục phiên hiện nút thử lại; không tự xóa phiên vì lỗi mạng.
- Không có hồ sơ/không được phân công: liên kết tài khoản và assignment bằng chức năng quản trị hiện có; không ghép người theo tên hoặc sửa ID trong mobile.
- Groq không khả dụng/quota: giữ chế độ theo chức năng, không retry liên tục hoặc đổi dịch vụ. Không gửi khóa vào chat/log.
- Nhật ký lỗi mạng: bản nháp vẫn ở ô nhập; thử lại khi có mạng. Kết quả xử lý cảnh báo lỗi: mở lại hộp thoại, nội dung nháp được giữ trong màn hình đó.
- Không có thiết bị trong flutter devices: build APK là kiểm tra biên dịch, chưa chứng minh điện thoại, cuộc gọi, thông báo nền hoặc USB/Wi-Fi hoạt động thực tế.
# APK bố cục chatbot và cài USB an toàn

APK mới riêng: `mobile/build/app/outputs/flutter-apk/app-chat-layout-debug.apk` (ARM64), backend thật `http://127.0.0.1:5000/api`; cần backend đang chạy cổng 5000 và USB reverse. Đây không phải APK dùng server giả lập.

Lệnh PowerShell, chạy tại thư mục gốc project, với SDK của máy kiểm tra:

```powershell
$adb = 'D:\Android\Sdk\platform-tools\adb.exe'
& $adb devices
& $adb -s 51330c42 reverse tcp:5000 tcp:5000
& $adb -s 51330c42 install -r 'mobile/build/app/outputs/flutter-apk/app-chat-layout-debug.apk'
# Chỉ mở sau khi install báo Success.
& $adb -s 51330c42 shell am start -n com.example.elderly_care_app/.MainActivity
```

Nếu aapt/adb không đọc được đường dẫn Unicode, dùng APK cùng bản build ở đường dẫn ASCII `C:\Users\MINH\AppData\Local\Temp\elderly-defense-20261010\build\app\outputs\flutter-apk\app-debug.apk`. Thư mục tạm này thuộc máy kiểm tra, không phải đường dẫn cố định cho mọi máy.

`INSTALL_FAILED_USER_RESTRICTED` là Android từ chối cài, không phải build lỗi. Chủ điện thoại kiểm tra Tùy chọn nhà phát triển → Cài đặt qua USB và chấp nhận hộp thoại. Không gỡ app/xóa dữ liệu để né lỗi. Lượt cuối vẫn bị chặn; chưa xác minh APK mới chạy trên điện thoại. Có thể attach Flutter sau khi cài/mở thành công; attach không thực hiện cài lại:

```powershell
Set-Location 'C:\Users\MINH\AppData\Local\Temp\elderly-defense-20261010'
flutter attach -d 51330c42
```
