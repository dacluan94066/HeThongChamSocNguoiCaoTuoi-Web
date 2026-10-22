# SOS realtime kèm âm thanh — 23/10/2026

## Sử dụng

Khởi động lại backend để nạp service đã sửa và tải lại Web. Tài khoản có quyền xem cảnh báo sẽ thấy thanh **Âm thanh SOS** dưới header. Âm thanh mặc định tắt; bấm **Bật âm thanh cảnh báo** để nghe thử ngắn và cho phép trang phát âm thanh. **Tắt chuông** chỉ dừng âm thanh đang phát, không gọi API tiếp nhận/xử lý SOS. Tắt tùy chọn âm thanh cũng không đóng hoặc xử lý cảnh báo.

Web cần đang mở và có kết nối Socket.IO. Không phải cơ chế push khi đã đóng trình duyệt. Dùng HTTPS hoặc localhost và cho phép localStorage/Web Locks; nếu thiếu điều kiện phối hợp giữa các tab, chỉ hiển thị cảnh báo và lý do, không phát nhiều chuông thiếu kiểm soát. Khi trình duyệt từ chối `play()` sẽ có thông báo và nút **Cho phép âm thanh**, không giả lập trạng thái đang phát. Không thể đảm bảo âm thanh nghe được nếu thiết bị/tab bị tắt tiếng hoặc âm lượng hệ điều hành bằng 0.

## Bảo toàn và giới hạn thay đổi

- Giữ API SOS, SQL schema, authentication và toàn bộ mã Flutter, GPS, nhấn giữ 3 giây, gửi SOS và nội dung phản hồi hiện có. Không thêm hệ thống realtime mới.
- SOS mới vẫn lưu các bản ghi trong transaction trước khi emit. Người nhận phải là Admin đang hoạt động, hoặc người chăm sóc đang hoạt động/làm việc, có phân công còn hiệu lực và quyền `QLCANHBAO/ChoPhepXem`. Admin giữ cơ chế bypass hiện có.
- Kiểm tra lại người nhận sau commit trước khi gửi, phát theo user room thay vì room Admin lưu từ lúc connect. Áp dụng cùng bộ lọc cho cập nhật trạng thái SOS; cập nhật riêng về Mobile chủ hồ sơ vẫn giữ nguyên. Lỗi kiểm tra realtime không fallback broadcast hay báo giả rằng transaction đã lưu thất bại.
- Nhánh cảnh báo thường/backend nhắc thuốc không đổi. Mức độ `KHAN_CAP` của chỉ số sức khỏe không đủ điều kiện phát chuông SOS; cần đúng nguồn/ID SOS. Web vẫn cập nhật badge và danh sách bằng cơ chế cũ, mở chi tiết bằng route `canh-bao?tab=sos&highlight=...` hiện có.
- Chỉ phát một vòng âm thanh cho cùng tài khoản trong các tab/kết nối cùng origin thông qua Web Locks. Tắt chuông/tùy chọn được truyền giữa các tab. Các tài khoản khác nhau có tùy chọn độc lập.
- Ledger chống trùng chỉ lưu ID SOS và thời điểm, tối đa 1.000 ID trong 7 ngày; không lưu tên, nội dung y tế hoặc GPS. Thông tin hiển thị chỉ giữ trong RAM và xóa khi đổi phiên/mất quyền. Dừng callback `play()` đến muộn sau mute/logout. SOS đã được backend báo xử lý không còn chờ phát chuông.
- Âm thanh đang dùng là `/audio/sos-bip-bip.mp3`, sao chép nguyên bản từ file `amthanhbipbip.mp3` do người dùng cung cấp. WAV và script tạo âm thanh cũ được giữ nguyên làm tham khảo, không còn là nguồn phát hiện tại.

## Kết quả đã thực sự chạy

| Trường hợp | Kết quả |
| --- | --- |
| Toàn bộ backend `node --test test/*.test.js` | PASS 347/347 |
| SOS/socket liên quan, quyền và hồi quy | PASS 27/27 trong bộ backend; VM mock SQL và Socket.IO loopback |
| Toàn bộ Web `node --test test/*.test.js` | PASS 50/50, gồm 24 test audio và 10 test hook/asset |
| Web build/lint | PASS, không error; còn warning bundle >500KB và 10 lint warning cũ ngoài tính năng |
| Flutter analyze và toàn bộ Flutter test | PASS, không issue; 485/485 test; không sửa source Mobile |
| Controller SOS thật + service thật trong VM, transaction RAM → Socket.IO thật → production hook/layout | PASS, fixture riêng; không SQL hay SOS thật |
| Web Admin/người chăm sóc hợp lệ nhận; tài khoản thiếu quyền không có toast/âm thanh | PASS mock/loopback và trình duyệt in-app |
| Tệp WAV ban đầu nhận `playing`, stop nhận `pause`; tắt chuông không đổi trạng thái SOS | PASS trình duyệt in-app ở bản chuông ban đầu; bản ghi fixture vẫn `DangGui` |
| Reconnect/replay/reload không thêm audio; nhiều SOS cùng một loop | PASS unit và trình duyệt in-app |
| Hai tab cùng tài khoản chỉ một tab phát, tắt từ tab còn lại | PASS Web Locks/BroadcastChannel thật trên trình duyệt in-app |
| Mở chi tiết SOS bằng giao diện hiện có, điều hướng không tự tắt chuông | PASS trình duyệt in-app với fixture |
| `NotAllowedError`, retry, lỗi tệp/kết nối audio | PASS test; giao diện retry được kiểm tra bằng lỗi autoplay giả lập trong browser fixture |
| Chrome desktop thực tế và chính sách autoplay Chrome thực tế | NOT_RUN: công cụ không có Chrome; không lấy kết quả in-app hoặc lỗi giả lập để thay thế |
| SQL Server end-to-end và SOS thật | NOT_RUN theo yêu cầu an toàn |
| `git diff --check` | PASS |

Phiên preview từng thiếu hai API đọc phụ của trang chi tiết; đã bổ sung fixture rỗng cho `/elderly` và `/caregivers` rồi chạy lại. Console còn cảnh báo có sẵn từ menu `alertItem` và component chi tiết Ant Design; không sửa giao diện/logic ngoài phạm vi để dọn các warning đó.

## Fixture trình duyệt có thể chạy lại

Từ thư mục frontend: `node test/run-sos-preview.mjs`, mở `http://127.0.0.1:5187/__sos-preview?user=501`.

- 501: Admin; 502: người chăm sóc hợp lệ; 503: thiếu quyền xem SOS.
- Các nút ghi rõ fixture. Chỉ `/__fixture/*` được tạo bản ghi trong RAM; không import `.env`, DB config hoặc gọi backend thật. API mutation khác bị từ chối 405. Các URL/control này chỉ tồn tại trong script kiểm thử, không được thêm vào backend ứng dụng hay production build.
- Có phát SOS mới, replay, cảnh báo thường, reconnect, đổi quyền UI và giả lập `NotAllowedError`. Kiểm tra Chrome thực tế vẫn cần thực hiện thủ công trên Chrome; không thay đổi cài đặt bảo mật/autoplay để ép PASS.
- Audio diagnostic ghi `audioId` vì sự kiện `playing` có thể lặp lại khi một tệp đang loop; không đếm mỗi `playing` là một chuông mới.
- Ảnh bằng chứng fixture: `C:/Users/Admin/Documents/ChatGPT/KLCN/sos_realtime_fixture.png` và `sos_autoplay_fixture.png` cùng thư mục.

## File sửa/tạo

1. `server/src/services/alertNotification.service.js`
2. `server/src/services/alertWorkflow.service.js`
3. `server/test/sos-flow.test.js`
4. `server/test/sos-realtime-permissions.test.js` (mới)
5. `frontend/src/hooks/useRealtimeAlerts.js`
6. `frontend/src/layouts/MainLayout.jsx`
7. `frontend/src/components/SosAudioControls.jsx` (mới)
8. `frontend/src/components/SosAudioControls.css` (mới)
9. `frontend/src/utils/sosAlarm.js` (mới)
10. `frontend/public/audio/sos-alert.wav` (mới)
11. `frontend/scripts/generate-sos-audio.mjs` (mới)
12. `frontend/test/sosAlarm.test.js` (mới)
13. `frontend/test/sosRealtimeHook.test.js` (mới)
14. `frontend/test/fixtures/sosPreview.jsx` (mới)
15. `frontend/test/run-sos-preview.mjs` (mới)
16. `frontend/test/README_sos_realtime.md` (mới)
17. `frontend/public/audio/sos-bip-bip.mp3` (bổ sung theo yêu cầu đổi âm thanh)

## Cập nhật âm thanh người dùng cung cấp

File MP3 mới giữ nguyên 1.296.002 byte; SHA-256 `a14fda8c1c39832bce47c25e7dfa725f9490f5e4f18ee89b603b977d6282c19a` trùng file nguồn. Test asset kiểm tra đúng file đang được controller chọn. Chỉ đổi URL nguồn phát, không sửa cơ chế bật/tắt, loop, khóa nhiều tab, autoplay, API hoặc backend. Không coi kết quả phát WAV trước đây là bằng chứng đã nghe thử MP3 mới trên Chrome.

Git trước khi sửa chỉ có thư mục tham khảo `mobile/design_reference/` chưa được theo dõi. Giữ nguyên thư mục này; không reset/clean, không stage/commit/push. Không sửa database, API/controller SOS, authentication hoặc mã Flutter. Không gửi SOS/gọi điện/ghi dữ liệu thật trong kiểm thử.
