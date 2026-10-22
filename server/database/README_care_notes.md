# Nhật ký chăm sóc — cập nhật 23/10/2026

## Nội dung đã triển khai

- Web có hướng dẫn dễ hiểu: chăm sóc ai, lúc nào, đã làm gì, tình trạng/kết quả và lưu ý bàn giao. Vẫn dùng tiêu đề và nội dung hiện có, không thêm các trường dữ liệu lâm sàng bắt buộc.
- Giữ nguyên 4 loại nhật ký và các API cũ. Nội dung ghi chú không tự tạo chỉ số, xác nhận thuốc, gửi SOS hoặc tạo cảnh báo.
- `NgayGhi` là giờ thực sự chăm sóc do người dùng chọn; `NgayTao` của bản mới là giờ server Việt Nam. Mặc định thời điểm hiện tại khi client cũ không gửi. Không sửa ngày của dữ liệu cũ hàng loạt.
- Timeline nhóm theo ngày chăm sóc, có người ghi, thời điểm tạo và lần sửa gần nhất. Lọc NCT/khoảng ngày/loại/từ khóa, giữ bộ lọc sau lưu, bỏ qua GET đã lỗi thời khi người dùng đổi bộ lọc nhanh.
- Tách loading/error/empty. Lỗi lưu giữ nguyên bản nháp. 409 chặn ghi đè, cho đối chiếu và xác nhận nạp bản mới; không tự đổi version rồi ghi lại.
- Web có sửa, xóa mềm kèm lý do và lịch sử trước/sau. Người ghi ban đầu không bị đổi thành người sửa. Nhật ký Admin mới lấy tên từ audit tạo; bản cũ không rõ tác giả không được đoán tên.
- Backend giữ payload Mobile cũ: loại/thời gian/lý do mới không bắt buộc khi client cũ bỏ qua. Nếu gửi lý do thì phải 5–300 ký tự; nếu không gửi, audit lưu null và UI hiển thị trung thực. Web vẫn bắt nhập lý do sửa/xóa.
- Quyền theo `QLNHATKY`, kiểm tra lại vai trò/quyền/phân công trong transaction. Người chăm sóc đang được phân công vẫn có thể sửa nhật ký của người chăm sóc khác theo nghiệp vụ đã có. NCT chỉ đọc theo phạm vi được phép, không ghi.
- Mỗi thay đổi có audit cùng transaction; lỗi audit rollback thay đổi. Xóa dùng `TrangThai=HUY`, không xóa SQL row. History API vẫn kiểm tra phạm vi khi xem bản đã xóa mềm; bản mồ côi không được công khai.
- Version gồm mọi trường sửa được và mã lịch sử mới nhất, ngăn ghi đè đồng thời/A→B→A. Sửa nội dung không làm tròn DATETIME2 gốc. Không tạo audit giả khi không có thay đổi thực sự.

## Cài bảng lịch sử

Chạy **chỉ** `server/database/patch_care_note_audit.sql` vào đúng database CareSenior đang sử dụng. Patch chỉ tạo bảng/index mới `dbo.LichSuNhatKyChamSoc`, có thể chạy lại an toàn, không cập nhật hay backfill nhật ký/hồ sơ/thuốc đang có. Không có migration tự chạy khi khởi động.

Đã thêm cùng định nghĩa bảng vào `QLSucKhoeNguoiCaoTuoi_FINAL.sql` cho cài đặt mới. **Không chạy lại FINAL.sql lên database có dữ liệu.**

Trong lượt triển khai ban đầu chưa chạy patch lên CSDL thật. Sau đó, ngày 23/10/2026, đã chạy riêng patch theo yêu cầu người dùng trên CSDL local `QLSucKhoeNguoiCaoTuoi`: xác minh đủ 11 cột, khóa chính, 3 index và 3 CHECK đang bật. Sáu nhật ký hiện có giữ nguyên số lượng và SHA-256 nội dung trước/sau; không tạo nhật ký thử trên tài khoản thật.

Với database khác chưa cài bảng, API đọc vẫn chạy, nhưng thêm/sửa/xóa trả 503 `CARE_NOTE_AUDIT_NOT_INSTALLED` trước khi ghi dữ liệu. Điều này tránh phát sinh thay đổi không có lịch sử.

## API

- `GET /api/care-notes`: giữ `nguoiCaoTuoiId`, `ngay` cũ; thêm `tuNgay`, `denNgay`, `loaiNhatKy`, `search` (tối đa 100 ký tự). Khoảng ngày theo giờ Việt Nam, tham số SQL được bind.
- `POST /api/care-notes`: `{nguoiCaoTuoiId,tieuDe,noiDung,loaiNhatKy?,thoiGianChamSoc?}`. Thời gian mới phải là ISO có `+07:00` hoặc `Z`, không tương lai.
- `PATCH /api/care-notes/:id`: `{version,tieuDe,noiDung,loaiNhatKy?,thoiGianChamSoc?,lyDo?}`. Không đổi NCT hoặc tác giả.
- `DELETE /api/care-notes/:id`: `{version,lyDo?}`; xóa mềm.
- `GET /api/care-notes/:id/history`: quyền xem cùng phạm vi NCT, trả hành động/tên người thực hiện/thời gian/lý do/snapshot trước và sau.

Lịch sử đã xóa vẫn được giữ qua API cho người có quyền; chưa thêm giao diện thùng rác/khôi phục.

## Kết quả kiểm thử thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| Backend `node --test test/*.test.js` | PASS 328/328, gồm 47 test nhật ký mới; DB giả lập, không ghi dữ liệu thật |
| Frontend `node --test test/*.test.js` | PASS 16/16 (8 test mới) |
| `npm run build` | PASS; còn cảnh báo chunk >500KB |
| `npm run lint` | PASS exit 0, 10 warning cũ ngoài phần thay đổi, không error |
| `flutter analyze` | PASS, không có issue |
| Toàn bộ `flutter test` | PASS 485/485, không đổi source Mobile |
| Trình duyệt, production CareNotesPage với API giả trong bộ nhớ | PASS thêm/sửa/xóa mềm, history trước/sau, lọc NCT giữ sau sửa/xóa, lỗi API tách empty, bản nháp và nút Save khi 409 |
| Chạy riêng SQL patch trên CSDL local theo yêu cầu người dùng | PASS, bảng/cột/index/CHECK được xác minh, nhật ký cũ không đổi |
| SQL Server end-to-end thêm/sửa/xóa qua API | NOT_RUN; chưa tạo hoặc thay đổi nhật ký thật để kiểm thử |
| Browser viewport 320dp/zoom 1,8× | NOT_RUN; đã xem bố cục ở kích thước pane thử khoảng 700px |
| `git diff --check` | PASS |

Trình duyệt dùng URL riêng `http://127.0.0.1:5186/__care-notes-preview`, API cùng port hoàn toàn trong RAM, không import cấu hình DB hoặc gọi backend port 5000. Trang ghi rõ mọi hồ sơ/nội dung là fixture. Ảnh bằng chứng ở `C:/Users/Admin/Documents/ChatGPT/KLCN/care_notes_history_preview.png`. Helper thử nghiệm nằm trong thư mục TEMP `care-notes-preview-e8ebf51e35c340e49beb784ba4ae3ae0`, không thuộc source dự án. Không dùng kết quả mock để tuyên bố đã nghiệm thu DB thật.

Console phiên preview còn cảnh báo tương thích Ant Design (props deprecated của Alert/Modal/Timeline, static message context và useForm khi đóng modal). Không có lỗi chặn các thao tác đã kiểm thử; chưa coi các cảnh báo này là đã được xử lý.

## File thay đổi của lượt này

1. `frontend/src/pages/CareNotes/CareNotesPage.jsx`
2. `frontend/src/pages/CareNotes/CareNotesPage.css` (mới)
3. `frontend/src/services/careNoteService.js`
4. `frontend/src/utils/careNotes.js` (mới)
5. `frontend/test/careNotes.test.js` (mới)
6. `server/src/controllers/nhatKyChamSoc.controller.js`
7. `server/src/routes/nhatKyChamSoc.routes.js`
8. `server/src/services/careNoteMutation.service.js`
9. `server/src/utils/careNoteValidation.js` (mới)
10. `server/src/utils/careNoteAudit.js` (mới)
11. `server/test/care-notes.test.js` (mới)
12. `server/test/mobile-write-workflows.test.js` (cập nhật mock cho các query mới, giữ regression cũ)
13. `server/database/patch_care_note_audit.sql` (mới)
14. `server/database/README_care_notes.md` (mới)
15. `server/ROUTE_PERMISSION_AUDIT.md`
16. `QLSucKhoeNguoiCaoTuoi_FINAL.sql` (chỉ thêm patch nhật ký, bảo toàn patch thuốc trước đó)

Đã ghi nhận Git status và đối chiếu baseline trước khi sửa. Không thay đổi source Mobile, thuốc, chỉ số, SOS, AI, authentication hoặc các thay đổi UI/điều hướng có sẵn. Không commit, push, reset, clean hoặc ghi nhật ký trên hồ sơ thật.
