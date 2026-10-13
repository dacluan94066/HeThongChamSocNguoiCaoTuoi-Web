-- Chay mot lan tren CSDL hien co truoc khi dung API quen mat khau.
-- Script idempotent: co the chay lai ma khong tao trung cot.

IF COL_LENGTH('dbo.NguoiDung', 'MaOTP') IS NULL
  ALTER TABLE dbo.NguoiDung ADD MaOTP VARCHAR(255) NULL;
GO

IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.NguoiDung')
    AND name = 'MaOTP'
    AND max_length < 255
)
  ALTER TABLE dbo.NguoiDung ALTER COLUMN MaOTP VARCHAR(255) NULL;
GO

IF COL_LENGTH('dbo.NguoiDung', 'MaOTPHetHan') IS NULL
  ALTER TABLE dbo.NguoiDung ADD MaOTPHetHan DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.NguoiDung', 'MaOTPGuiLuc') IS NULL
  ALTER TABLE dbo.NguoiDung ADD MaOTPGuiLuc DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.NguoiDung', 'MaOTPCuaSoBatDau') IS NULL
  ALTER TABLE dbo.NguoiDung ADD MaOTPCuaSoBatDau DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.NguoiDung', 'SoLanGuiOTP') IS NULL
  ALTER TABLE dbo.NguoiDung
    ADD SoLanGuiOTP INT NOT NULL
      CONSTRAINT DF_NguoiDung_SoLanGuiOTP DEFAULT (0) WITH VALUES;
GO
