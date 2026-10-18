-- Migration: Add MedicalHistory table
-- Date: 2024-10-12
IF OBJECT_ID('dbo.MedicalHistory', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MedicalHistory (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ElderlyId INT NOT NULL,
        Disease NVARCHAR(200) NULL,
        Allergy NVARCHAR(200) NULL,
        Surgery NVARCHAR(200) NULL,
        Medication NVARCHAR(200) NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
    );
    ALTER TABLE dbo.MedicalHistory
        ADD CONSTRAINT FK_MedicalHistory_Elderly FOREIGN KEY (ElderlyId)
        REFERENCES dbo.HoSoNguoiCaoTuoi(NguoiCaoTuoiID);
    CREATE INDEX IX_MedicalHistory_Elderly_Created ON dbo.MedicalHistory(ElderlyId, CreatedAt);
END;
GO
