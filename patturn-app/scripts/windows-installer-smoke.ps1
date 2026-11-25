# Scoped CI smoke only: the hosted runner already has WebView2 and other software.
# Does NOT prove a clean Windows install, offline OS operation, UI correctness or upgrade.
param(
  [string]$BundleDirectory = "apps/desktop/src-tauri/target/release/bundle/nsis"
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$bundle = (Resolve-Path $BundleDirectory).Path
$installers = @(Get-ChildItem $bundle -Filter '*-setup.exe')
if ($installers.Count -ne 1) { throw 'EXPECTED_ONE_NSIS_INSTALLER' }
$installer = $installers[0]
$work = Join-Path $env:RUNNER_TEMP ('patturn-smoke-' + [guid]::NewGuid().ToString('N'))
$extract = Join-Path $work 'payload'
$destination = Join-Path $work 'installed'
New-Item -ItemType Directory -Force -Path $extract | Out-Null
$report = [ordered]@{
  schemaVersion = 1
  commit = $env:GITHUB_SHA
  platform = [System.Environment]::OSVersion.VersionString
  architecture = $env:PROCESSOR_ARCHITECTURE
  scope = 'Hosted Windows runner: embedded prerequisite verification, silent installation, visible process window and uninstall only'
  cleanMachineTested = $false
  osOfflineTested = $false
  frontendWorkflowTested = $false
  upgradeTested = $false
  offlineWebViewPayloadVerified = $false
  silentInstallPassed = $false
  installedWindowOpened = $false
  silentUninstallPassed = $false
  success = $false
}
$application = $null
try {
  # NSIS is a self-extracting archive. Prove it contains the FULL Microsoft runtime,
  # not just the ~2MB online bootstrapper. This also detects config regressions.
  & 7z x $installer.FullName "-o$extract" -y | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'NSIS_PAYLOAD_EXTRACTION_FAILED' }
  $runtimes = @(Get-ChildItem $extract -Recurse -Filter '*.exe' | Where-Object { $_.Name -match '(?i)webview2' -and $_.Length -gt 50000000 })
  if ($runtimes.Count -ne 1) { throw 'FULL_OFFLINE_WEBVIEW2_PAYLOAD_MISSING' }
  $runtime = $runtimes[0]
  $signature = Get-AuthenticodeSignature $runtime.FullName
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'OFFLINE_WEBVIEW2_SIGNATURE_INVALID' }
  $report.offlineWebViewPayloadVerified = $true
  $report.runtimePayload = [ordered]@{
    name = $runtime.Name
    bytes = $runtime.Length
    sha256 = (Get-FileHash $runtime.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    microsoftSignatureValid = $true
  }
  # /D must be the final, unquoted argument in the NSIS command line.
  # RUNNER_TEMP is normally without spaces; explicitly choose a no-space CI path.
  if ($destination -match '\s') { throw 'SMOKE_INSTALL_PATH_MUST_NOT_CONTAIN_SPACES' }
  $setup = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$destination") -PassThru
  if (-not $setup.WaitForExit(180000)) { $setup.Kill(); throw 'NSIS_INSTALL_TIMEOUT' }
  if ($setup.ExitCode -notin @(0, 3010)) { throw "NSIS_INSTALL_FAILED:$($setup.ExitCode)" }
  $executable = Join-Path $destination 'patturn-desktop.exe'
  if (-not (Test-Path $executable)) { throw 'INSTALLED_EXECUTABLE_MISSING' }
  $report.silentInstallPassed = $true
  $env:PATTURN_STARTUP_LOG = Join-Path $work 'startup.log'
  $application = Start-Process -FilePath $executable -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline) {
    $application.Refresh()
    if ($application.HasExited) { throw "INSTALLED_APPLICATION_EXITED:$($application.ExitCode)" }
    if ($application.MainWindowHandle -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 500
  }
  if ($application.MainWindowHandle -eq [IntPtr]::Zero) { throw 'INSTALLED_WINDOW_NOT_OPENED' }
  Start-Sleep -Seconds 5
  $application.Refresh()
  if ($application.HasExited -or -not $application.Responding) { throw 'INSTALLED_WINDOW_NOT_RESPONDING' }
  $report.installedWindowOpened = $true
  $application.CloseMainWindow() | Out-Null
  if (-not $application.WaitForExit(10000)) { $application.Kill(); $application.WaitForExit() }
  $uninstallers = @(Get-ChildItem $destination -Filter '*uninstall*.exe')
  if ($uninstallers.Count -ne 1) { throw 'UNINSTALLER_MISSING' }
  $uninstall = Start-Process $uninstallers[0].FullName -ArgumentList '/S' -PassThru
  if (-not $uninstall.WaitForExit(120000)) { $uninstall.Kill(); throw 'UNINSTALL_TIMEOUT' }
  if ($uninstall.ExitCode -ne 0) { throw "UNINSTALL_FAILED:$($uninstall.ExitCode)" }
  # NSIS may spawn a temporary uninstaller; wait for the installed executable to go.
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ((Test-Path $executable) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (Test-Path $executable) { throw 'UNINSTALL_LEFT_INSTALLED_EXECUTABLE' }
  $report.silentUninstallPassed = $true
  $report.success = $true
} catch {
  # Error codes from this script contain no project contents or user paths.
  $report['failure'] = $_.Exception.Message
  $startupLog = Join-Path $work 'startup.log'
  if (Test-Path $startupLog) {
    $startup = Get-Content $startupLog -Raw
    $startup = $startup.Substring(0, [Math]::Min(4000, $startup.Length))
    $report['startupDiagnostic'] = $startup
    $safeStartup = $startup.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host "::error title=Patturn startup panic::$safeStartup"
  }
  $annotation = $_.Exception.Message.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
  Write-Host "::error title=Windows installer smoke::$annotation"
  throw
} finally {
  if ($application -and -not $application.HasExited) { $application.Kill() }
  $report | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $bundle 'windows-installer-smoke.json') -Encoding utf8
}
