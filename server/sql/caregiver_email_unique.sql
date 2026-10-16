-- Chay mot lan tren CSDL hien co de moi nguoi cham soc chi co mot email rieng.
-- Kiem tra trung truoc khi tao unique index; script se dung va bao loi neu con du lieu trung.

UPDATE dbo.NguoiChamSoc
SET Email = LOWER(LTRIM(RTRIM(Email)))
WHERE Email IS NOT NULL;
GO

IF EXISTS (
  SELECT LOWER(LTRIM(RTRIM(Email)))
  FROM dbo.NguoiChamSoc
  WHERE Email IS NOT NULL
  GROUP BY LOWER(LTRIM(RTRIM(Email)))
  HAVING COUNT(*) > 1
)
  THROW 51000, N'Không thể tạo ràng buộc: đang có email người chăm sóc bị trùng.', 1;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.NguoiChamSoc')
    AND name = N'UX_NguoiChamSoc_Email'
)
  CREATE UNIQUE INDEX UX_NguoiChamSoc_Email
    ON dbo.NguoiChamSoc(Email)
    WHERE Email IS NOT NULL;
GO
