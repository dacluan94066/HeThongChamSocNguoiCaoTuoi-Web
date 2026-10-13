-- Migration dang nhap Google cho CSDL QLSucKhoeNguoiCaoTuoi dang ton tai.
-- Co the chay lai an toan; khong xoa hay thay doi du lieu tai khoan cu.

IF COL_LENGTH('dbo.NguoiDung', 'GoogleSubject') IS NULL
  ALTER TABLE dbo.NguoiDung ADD GoogleSubject VARCHAR(255) NULL;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.NguoiDung')
    AND name = 'UX_NguoiDung_GoogleSubject'
)
  CREATE UNIQUE INDEX UX_NguoiDung_GoogleSubject
    ON dbo.NguoiDung(GoogleSubject)
    WHERE GoogleSubject IS NOT NULL;
GO
