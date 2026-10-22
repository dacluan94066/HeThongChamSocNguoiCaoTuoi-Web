# Hệ thống quản lý và cảnh báo chăm sóc sức khỏe người cao tuổi

Project gồm Web quản trị React/Vite, backend Node.js/Express và cơ sở dữ liệu SQL Server. Backend được dùng chung cho Web và ứng dụng Mobile.

## Chạy thử project

### 1. Tạo cơ sở dữ liệu

Mở SQL Server Management Studio và chạy file:

```text
QLSucKhoeNguoiCaoTuoi_FINAL.sql
```

Lưu ý: script hiện tại sẽ xóa database `QLSucKhoeNguoiCaoTuoi` nếu database đã tồn tại rồi tạo lại từ đầu. Không chạy trên cơ sở dữ liệu có dữ liệu cần giữ.

### 2. Cấu hình backend

Sao chép `server/.env.example` thành `server/.env`, sau đó điền:

- Thông tin kết nối SQL Server.
- `JWT_SECRET` bằng một chuỗi bí mật đủ dài.
- `SEED_PASSWORD` là mật khẩu dùng chung để tạo các tài khoản chạy thử.

Không commit file `server/.env` lên Git.

### 3. Cài đặt và chạy backend

Mở terminal tại thư mục `server`:

```bash
npm install
npm run dev
```

Backend mặc định chạy tại `http://localhost:5000`.

### 4. Tạo tài khoản chạy thử

Giữ backend hoạt động và mở terminal khác tại thư mục `server`:

```bash
node seed_users.js
```

File SQL đã tạo sẵn 3 vai trò, 11 chức năng và 33 dòng phân quyền. Chỉ chạy
`seed_phanquyen.js` khi cần khởi tạo lại ma trận quyền; không bắt buộc sau khi
chạy file SQL trên.

Các tài khoản được tạo bởi `seed_users.js`:

| Tên đăng nhập | Vai trò |
|---|---|
| `admin` | Quản trị viên |
| `caregiver01` | Người chăm sóc |
| `nct.an`, `nct.binh`, `nct.cuong`, `nct.dung`, `nct.duc` | Người cao tuổi (Mobile) |

Muốn có dữ liệu thử (hồ sơ, toa thuốc, lịch khám, chỉ số), sau khi chạy
`seed_users.js` hãy chạy `DU_LIEU_MAU_DAY_DU.sql` trong SSMS, rồi chạy lại
`node seed_users.js` để liên kết tài khoản Mobile với các hồ sơ người cao tuổi vừa tạo.
Tên bác sĩ
trong dữ liệu này chỉ là thông tin của lần khám bên ngoài, không phải vai trò
hay tài khoản đăng nhập trong hệ thống.

Tất cả tài khoản chạy thử sử dụng giá trị `SEED_PASSWORD` đã cấu hình trong `server/.env`. README không cung cấp hoặc lưu mật khẩu này.

### 5. Cài đặt và chạy frontend

Mở terminal tại thư mục `frontend`:

```bash
npm install
npm run dev
```

Frontend mặc định chạy tại `http://localhost:5173` và gọi backend theo `VITE_API_URL`.

Tại trang đăng nhập Web, người chăm sóc có thể chọn **Tạo tài khoản Web**. Tài khoản
mới ở trạng thái **Chờ duyệt**, chưa thể đăng nhập. Quản trị viên vào **Người dùng &
Phân quyền** để kiểm tra và duyệt, sau đó gán người cao tuổi phụ trách trong **Hồ sơ
NCT**. Không cần chạy thêm SQL cho luồng đăng ký này. Nếu email/SĐT đã nằm trong hồ
sơ người chăm sóc được tạo trước đó, quản trị viên cần tạo/liên kết tài khoản qua
giao diện quản trị; đăng ký công khai không tự nhận hồ sơ có sẵn.

### Tạo hồ sơ NCT kèm tài khoản Mobile trên Web

Vào **Người dùng & Phân quyền → Tạo tài khoản mới → Vai trò: Người cao tuổi**.
Form sẽ hiện đầy đủ thông tin cá nhân/sức khỏe lấy từ form Hồ sơ NCT và phần
tài khoản Mobile. Nhập tên đăng nhập (3–50 ký tự chữ/số/`._-`), email riêng để khôi phục mật khẩu,
mật khẩu ít nhất 6 ký tự (tối đa 72 byte UTF-8) và nhập lại mật khẩu. Tài khoản
vai trò `NguoiCaoTuoi` và hồ sơ được tạo trong một transaction, mật khẩu lưu dạng
băm bcrypt. Nếu tên đăng nhập/email/SĐT trùng hoặc lưu hồ sơ thất bại thì không
giữ lại tài khoản dở dang. NCT đăng nhập Mobile ngay bằng tên đăng nhập/email,
hoặc SĐT nếu có khai báo. Luồng này yêu cầu Admin và quyền `QLNGUOIDUNG/them` hiện có.

Trang **Hồ sơ NCT** không còn nút/form thêm mới; vẫn xem/sửa, phân công người chăm
sóc và đặt lại mật khẩu như trước. Sửa hồ sơ không tự đổi mật khẩu và không tạo
thêm tài khoản. Vai trò Admin/NCS ở trang Người dùng vẫn giữ luồng tạo hiện có.
Không cần thêm bảng, chạy lại database hay migration: dùng `NguoiDung` và
`HoSoNguoiCaoTuoi.UserID` sẵn có.

API `POST /api/users` với `vaiTro: 'NGUOI_CAO_TUOI'` yêu cầu thêm `ngaySinh`,
`gioiTinh` và các trường hồ sơ tùy chọn `cccd`, `diaChi`, `nhomMau`, `benhNen`,
`diUng`, bên cạnh `hoTen`, `username`, `password`, `email`, `soDienThoai`.
Trả `id` là UserID và `nguoiCaoTuoiId` là hồ sơ liên kết; không tạo tài khoản
NCT trống nếu thiếu thông tin hồ sơ. Phản hồi/lỗi dùng chung service với API
hồ sơ để giữ transaction, validation và chống trùng nhất quán.

API cũ `POST /api/elderly` giữ tương thích (không còn điểm thêm mới trên UI), nhận
`taiKhoan: { tenDangNhap, email, matKhau }`; trả `id`, `userId`,
`coTaiKhoanMobile` và `tenDangNhap` (khi có tài khoản), không trả mật khẩu/hash.
`GET /api/elderly` và `GET /api/elderly/:id` trả thêm thông tin tài khoản đã
liên kết (userId/tên đăng nhập/email), giữ nguyên quyền và phạm vi hồ sơ.

Admin có thể vào **Chi tiết** hoặc **Chỉnh sửa hồ sơ NCT → Tài khoản đăng nhập
Mobile → Đặt lại mật khẩu Mobile** để nhập mật khẩu mới và nhập lại xác nhận.
Đây là thao tác riêng, không cần lưu hay thay đổi thông tin hồ sơ. Chỉ hiện khi
hồ sơ có tài khoản; người chăm sóc không có nút và backend cũng từ chối.
API mới `POST /api/elderly/:id/reset-password` nhận `{matKhauMoi}`, yêu cầu JWT,
quyền `QLHOSONCT/sua` và vai trò `QuanTriVien`. Backend xác minh UserID liên kết
thuộc vai trò `NguoiCaoTuoi`, băm mật khẩu và hủy OTP khôi phục cũ trong transaction.
Không tạo tài khoản mới, không đổi vai trò, không mở khóa tài khoản, không trả
mật khẩu/hash. Phiên đăng nhập đã cấp trước đó vẫn theo cơ chế JWT hiện có;
đặt lại mật khẩu không bổ sung cơ chế thu hồi toàn bộ phiên.

Admin cũng có thể vào **Người dùng & Phân quyền → Người dùng → Thao tác →
biểu tượng chìa khóa (Đặt lại mật khẩu)** để đặt mật khẩu cho bất kỳ tài khoản
Admin, người chăm sóc hoặc NCT đã có. Form hiển thị tên/tên đăng nhập đích,
yêu cầu mật khẩu mới và nhập lại xác nhận; không yêu cầu mật khẩu cũ.
Mật khẩu tối thiểu 6 ký tự, không chỉ gồm khoảng trắng và tối đa 72 byte UTF-8.
Nút khóa/mở khóa vẫn là thao tác riêng, không phải đặt lại mật khẩu.

`POST /api/users/:id/reset-password` nhận duy nhất `{matKhauMoi}`, yêu cầu JWT,
vai trò `QuanTriVien` và quyền `QLNGUOIDUNG/sua`. API băm bằng bcrypt, cập nhật
nguyên tử đúng UserID và hủy OTP/token khôi phục cũ; không đổi vai trò, trạng
thái hoặc hồ sơ và không trả mật khẩu/hash. Lỗi dữ liệu trả 422, không tìm thấy
người dùng trả 404; người chăm sóc/NCT bị từ chối 403. Các phiên JWT đăng nhập
đã cấp không bị thu hồi; mật khẩu cũ không dùng được cho lần đăng nhập mới.
Không cần tạo/chạy thêm SQL để sử dụng chức năng này.

## Bổ sung hồ sơ NCT trên Mobile sau đăng nhập

Khi tài khoản NCT đã có nhưng chưa liên kết hồ sơ, Mobile mở **Bổ sung hồ sơ NCT**
thay vì vào Trang chủ trống. Áp dụng cho đăng nhập mật khẩu, Google và khôi phục
phiên. Tên/SĐT được gợi ý từ tài khoản; người dùng tự chọn ngày sinh, giới tính
và bổ sung các trường còn lại. Chỉ khi bấm **Lưu hồ sơ và tiếp tục**, hồ sơ mới
được tạo và gắn vào tài khoản hiện tại; không tạo lại tài khoản, không tự điền
thông tin sức khỏe và không tự phân công người chăm sóc.

API `POST /api/elderly/me` nhận `hoTen`, `ngaySinh`, `gioiTinh` và các trường tùy
chọn `soDienThoai`, `cccd`, `diaChi`, `nhomMau`, `benhNen`, `diUng`. Chỉ NCT được
gọi, cần JWT và quyền tự sửa hồ sơ `QLHOSONCT/sua` hiện có. UserID lấy duy nhất
từ phiên xác thực; không nhận ID/role/trạng thái/người chăm sóc/tài khoản khác.
Trả 201 khi tạo; 200 nếu đã có hồ sơ (không ghi đè); 422 nếu thông tin không hợp
lệ, 409 khi SĐT/CCCD đã thuộc dữ liệu khác. Không tự ghép hồ sơ theo tên/SĐT/CCCD.
Transaction đồng bộ tên/SĐT tài khoản và đảm bảo gửi lặp không tạo hồ sơ thứ hai.
Không thay mật khẩu/email/vai trò và không cần sửa CSDL hay ma trận quyền.

Chỉ phản hồi 404 với mã `ELDERLY_PROFILE_NOT_FOUND` kích hoạt form; lỗi mạng,
lỗi máy chủ hay 404 khác hiển thị **Thử lại**, không tự tạo hồ sơ. Lưu xong Mobile
tải lại hồ sơ và vào Trang chủ. Tài khoản đã có hồ sơ không bị ảnh hưởng.

## Kiểm thử backend

Tại thư mục `server`, chạy bộ test tự động:

```bash
node --test test/*.test.js
```

Để kiểm tra lại các lỗi nghiệp vụ với Express và SQL Server thật:

```bash
npm run test:business-regressions
```

Lệnh này dùng thông tin kết nối SQL Server trong `server/.env`, tạo database
thử có tên `CareSenior_Regression_<thời gian>_<mã ngẫu nhiên>`, nạp cấu trúc từ
`QLSucKhoeNguoiCaoTuoi_FINAL.sql` và tự xóa database thử sau khi chạy. Tài khoản
SQL cần quyền tạo database; database ứng dụng hiện tại không bị ghi dữ liệu.
Các trường hợp kiểm tra gồm tạo đơn cho NCT cần chăm sóc đặc biệt, seed quyền
hai lần, phân loại câu hỏi về bài tập và kiểm tra SĐT khi thêm/sửa NCS, liên hệ.
Ngoài ra kiểm tra Admin tạo hồ sơ + tài khoản Mobile, đăng nhập theo ba định danh,
phạm vi hồ sơ, quyền Web/Mobile, trùng dữ liệu, tạo đồng thời, rollback khi SQL
lưu hồ sơ lỗi và tương thích luồng chỉ tạo hồ sơ.
Kiểm tra thêm Admin đặt lại mật khẩu NCT: NCS/NCT bị 403, mật khẩu cũ bị từ chối,
mật khẩu mới đăng nhập đúng hồ sơ, token khôi phục cũ hết hiệu lực, hồ sơ chưa có
tài khoản hoặc liên kết sai vai trò không bị cập nhật.
Kiểm tra tạo NCT ở `POST /api/users`, không có tài khoản thiếu hồ sơ, rollback khi
trùng CCCD/lỗi hồ sơ, đăng nhập Mobile vào đúng hồ sơ và luồng tạo Admin/NCS cũ.
