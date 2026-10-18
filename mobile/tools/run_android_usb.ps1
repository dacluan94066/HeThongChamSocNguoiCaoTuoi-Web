param(
    [string]$DeviceId = '51330c42',
    [string]$ApiBaseUrl = 'http://127.0.0.1:5000/api',
    [string]$IntegrationTest = '',
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
$apiUri = [uri]$ApiBaseUrl
if ($apiUri.Scheme -notin @('http','https') -or $apiUri.Host -notin @('127.0.0.1','localhost') -or $apiUri.AbsolutePath -ne '/api' -or $apiUri.UserInfo -or $apiUri.Query -or $apiUri.Fragment) { throw 'Use a loopback API URL ending in /api.' }
if ($IntegrationTest) {
    $testPath = [IO.Path]::GetFullPath((Join-Path $mobileSource $IntegrationTest))
    $testRoot = [IO.Path]::GetFullPath((Join-Path $mobileSource 'integration_test')) + [IO.Path]::DirectorySeparatorChar
    if (!$testPath.StartsWith($testRoot, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $testPath)) { throw 'Choose an existing integration_test file inside mobile.' }
    if ($IntegrationTest -match 'care_android_' -and $apiUri.Port -ne 5059) { throw 'Care integration tests require the guarded synthetic API on port 5059.' }
}
$response = Invoke-WebRequest ($apiUri.GetLeftPart([UriPartial]::Authority) + '/') -UseBasicParsing -TimeoutSec 8
if ($response.StatusCode -ne 200) { throw 'Selected backend is not ready.' }
New-Item -ItemType Directory -Path $workingCopy | Out-Null
$buildOutput = Join-Path $mobileSource ('build/' + (Split-Path $workingCopy -Leaf))
New-Item -ItemType Directory -Path $buildOutput | Out-Null
# The ASCII junction keeps large build outputs on the project drive.
New-Item -ItemType Junction -Path (Join-Path $workingCopy 'build') -Target $buildOutput | Out-Null
foreach ($part in @('lib', 'android', 'assets', 'web', 'integration_test', 'test')) {
    $sourcePart = Join-Path $mobileSource $part
    if (Test-Path -LiteralPath $sourcePart) {
        & robocopy $sourcePart (Join-Path $workingCopy $part) /E /XD build .gradle /XF local.properties .env .env.* key.properties *.jks *.keystore /NFL /NDL /NJH /NJS
        if ($LASTEXITCODE -ge 8) { throw 'Source copy failed.' }
    }
}
Copy-Item -LiteralPath (Join-Path $mobileSource 'pubspec.yaml'),(Join-Path $mobileSource 'pubspec.lock') -Destination $workingCopy
& $Adb -s $DeviceId reverse ('tcp:' + $apiUri.Port) ('tcp:' + $apiUri.Port)
if ($LASTEXITCODE -ne 0) { throw 'USB reverse failed.' }
if ($IntegrationTest -match 'care_android_') {
    & $Adb -s $DeviceId reverse tcp:15060 tcp:5060
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic credential bootstrap reverse failed.' }
}
Write-Host "Working copy: $workingCopy"
Push-Location -LiteralPath $workingCopy
try {
    & $Flutter pub get --offline
    if ($LASTEXITCODE -ne 0) { throw 'Dependencies must already be cached for offline pub get.' }
    if ($IntegrationTest) {
        & $Flutter test $IntegrationTest -d $DeviceId "--dart-define=API_BASE_URL=$ApiBaseUrl"
    } else {
        & $Flutter run -d $DeviceId "--dart-define=API_BASE_URL=$ApiBaseUrl"
    }
    if ($LASTEXITCODE -ne 0) { throw 'Flutter run failed. Original project has been preserved.' }
} finally { Pop-Location }
