-- Chay mot lan tren CSDL hien co truoc khi dung dang nhap Google.
-- Script idempotent: co the chay lai ma khong tao trung cot/index.

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
