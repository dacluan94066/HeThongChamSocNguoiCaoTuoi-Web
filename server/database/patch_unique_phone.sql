-- Chay thu cong sau khi sao luu CSDL. Script co the chay lap lai.
-- Neu con so dien thoai trung, dung truoc khi tao index de xu ly du lieu.
IF EXISTS (
  SELECT 1 FROM NguoiDung
  WHERE SoDienThoai IS NOT NULL
  GROUP BY SoDienThoai HAVING COUNT(*) > 1
)
  THROW 51001, N'So dien thoai NguoiDung dang bi trung; can xu ly truoc khi tao unique index.', 1;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id=OBJECT_ID(N'dbo.NguoiDung')
    AND name=N'UX_NguoiDung_SoDienThoai'
)
  CREATE UNIQUE INDEX UX_NguoiDung_SoDienThoai
    ON dbo.NguoiDung(SoDienThoai)
    WHERE SoDienThoai IS NOT NULL;
GO
