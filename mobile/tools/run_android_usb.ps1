param(
    [string]$DeviceId = '51330c42',
    [string]$Flutter = 'C:\tools\flutter\bin\flutter.bat',
    [string]$Adb = 'D:\Android\Sdk\platform-tools\adb.exe'
)
$ErrorActionPreference = 'Stop'
$mobileSource = Split-Path $PSScriptRoot -Parent
# A new ASCII working copy preserves the original and all uncommitted files.
$workingCopy = Join-Path $env:TEMP ('elderly-usb-' + [guid]::NewGuid().ToString('N'))
if ($workingCopy -match '[^\x00-\x7F]') { throw 'TEMP must point to a writable ASCII path.' }
if (!(Test-Path -LiteralPath $Flutter) -or !(Test-Path -LiteralPath $Adb)) {
    throw 'Pass -Flutter and -Adb with the installed SDK executable paths.'
}
$devices = & $Adb devices
if (!($devices | Where-Object { $_ -match ('^' + [regex]::Escape($DeviceId) + '\s+device\s*$') })) {
    throw 'The selected Android device is disconnected or not authorized.'
}
$response = Invoke-WebRequest 'http://127.0.0.1:5000/' -UseBasicParsing -TimeoutSec 8
if ($response.StatusCode -ne 200) { throw 'Backend port 5000 is not ready.' }
New-Item -ItemType Directory -Path $workingCopy | Out-Null
$buildOutput = Join-Path $mobileSource ('build/' + (Split-Path $workingCopy -Leaf))
New-Item -ItemType Directory -Path $buildOutput | Out-Null
# The ASCII junction keeps large build outputs on the project drive.
New-Item -ItemType Junction -Path (Join-Path $workingCopy 'build') -Target $buildOutput | Out-Null
foreach ($part in @('lib', 'android', 'assets', 'web')) {
    $sourcePart = Join-Path $mobileSource $part
    if (Test-Path -LiteralPath $sourcePart) {
        & robocopy $sourcePart (Join-Path $workingCopy $part) /E /XD build .gradle /XF local.properties .env .env.* key.properties *.jks *.keystore /NFL /NDL /NJH /NJS
        if ($LASTEXITCODE -ge 8) { throw 'Source copy failed.' }
    }
}
Copy-Item -LiteralPath (Join-Path $mobileSource 'pubspec.yaml'),(Join-Path $mobileSource 'pubspec.lock') -Destination $workingCopy
& $Adb -s $DeviceId reverse tcp:5000 tcp:5000
if ($LASTEXITCODE -ne 0) { throw 'USB reverse failed.' }
Write-Host "Working copy: $workingCopy"
Push-Location -LiteralPath $workingCopy
try {
    & $Flutter pub get --offline
    if ($LASTEXITCODE -ne 0) { throw 'Dependencies must already be cached for offline pub get.' }
    & $Flutter run -d $DeviceId --dart-define=API_BASE_URL=http://127.0.0.1:5000/api
    if ($LASTEXITCODE -ne 0) { throw 'Flutter run failed. Original project has been preserved.' }
} finally { Pop-Location }
