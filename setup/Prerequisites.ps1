param([switch]$SystemInstall, [switch]$Inspect, [switch]$LibraryOnly)
$ErrorActionPreference = 'Stop'
$script:SetupRoot = $PSScriptRoot
$script:PayloadRoot = Join-Path $PSScriptRoot 'payload'
if (-not (Test-Path -LiteralPath $script:PayloadRoot)) { $script:PayloadRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'payload' }
$script:Manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'payload.lock.json') -Raw | ConvertFrom-Json

function Get-Package([string]$Id) { return @($script:Manifest.packages | Where-Object { $_.id -eq $Id })[0] }
function Get-VersionNumber([string]$Text) {
    $match = [regex]::Match(($Text -replace "`0", ''), '\b(\d+\.\d+\.\d+(?:\.\d+)?)\b')
    if ($match.Success) { return [version]$match.Groups[1].Value }
    return [version]'0.0.0'
}
function Invoke-Capture([string]$File, [string]$Arguments) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $File; $info.Arguments = $Arguments
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(12000)) { $process.Kill(); return @{ Code = -1; Text = 'Timed out' } }
        return @{ Code = $process.ExitCode; Text = (($stdout.Result + $stderr.Result) -replace "`0", '') }
    } catch { return @{ Code = -1; Text = $_.Exception.Message } }
    finally { $process.Dispose() }
}
function Find-DockerDesktop {
    foreach ($candidate in @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
    )) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
    foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop')) {
        $location = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).InstallLocation
        if ($location) { $candidate = Join-Path $location 'Docker Desktop.exe'; if (Test-Path -LiteralPath $candidate) { return $candidate } }
    }
    return $null
}
function Assert-Payload([string]$Id, [string]$Path) {
    $package = Get-Package $Id
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing package: $Id. Reinstall KubeLab from the complete installer." }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.sha256) { throw "SHA-256 mismatch: $Id. Installation stopped." }
    if ($Id -in @('docker', 'wsl')) {
        $signature = Get-AuthenticodeSignature -LiteralPath $Path
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch $package.publisher) { throw "Publisher verification failed: $Id ($($signature.Status)). No file was executed." }
    }
}
function Get-PrerequisiteState {
    $wsl = Invoke-Capture (Join-Path $env:SystemRoot 'System32\wsl.exe') '--version'
    $wslVersion = if ($wsl.Code -eq 0) { Get-VersionNumber $wsl.Text } else { [version]'0.0.0' }
    $desktop = Find-DockerDesktop
    $dockerTool = Get-Command docker.exe -ErrorAction SilentlyContinue
    $dockerPath = if ($dockerTool) { $dockerTool.Source } elseif ($desktop) { Join-Path (Split-Path $desktop -Parent) 'resources\bin\docker.exe' } else { $null }
    $engine = if ($dockerPath -and (Test-Path -LiteralPath $dockerPath)) { Invoke-Capture $dockerPath 'info --format {{.OSType}}' } else { @{ Code = -1; Text = '' } }
    return [pscustomobject]@{
        Build = [Environment]::OSVersion.Version.Build
        X64 = [Environment]::Is64BitOperatingSystem -and $env:PROCESSOR_ARCHITECTURE -eq 'AMD64'
        WslVersion = $wslVersion.ToString()
        WslReady = $wslVersion -ge [version]'2.1.5'
        DockerDesktop = $desktop
        DockerEngineReady = $engine.Code -eq 0 -and $engine.Text.Trim() -eq 'linux'
        MinikubeBundled = Test-Path -LiteralPath (Join-Path $script:PayloadRoot 'minikube.exe')
        KubectlBundled = Test-Path -LiteralPath (Join-Path $script:PayloadRoot 'kubectl.exe')
    }
}
if ($LibraryOnly) { return }
if ($Inspect) { Get-PrerequisiteState | ConvertTo-Json -Compress; exit 0 }

if ($SystemInstall) {
    # Only this path changes system components. Never called by inspection/tests.
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { exit 5 }
    $logDirectory = Join-Path $env:ProgramData 'KubeLab\Setup'
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    $transcript = Join-Path $logDirectory 'prerequisites.log'
    Start-Transcript -Path $transcript -Append | Out-Null
    try {
        $restart = $false
        foreach ($feature in @('VirtualMachinePlatform')) {
            $state = Get-WindowsOptionalFeature -Online -FeatureName $feature
            if ($state.State -eq 'EnablePending') { $restart = $true }
            elseif ($state.State -ne 'Enabled') {
                # LimitAccess prevents an implicit download from Windows Update.
                $result = Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart -LimitAccess
                if ($result.RestartNeeded) { $restart = $true }
            }
        }
        $wsl = Invoke-Capture (Join-Path $env:SystemRoot 'System32\wsl.exe') '--version'
        if ($wsl.Code -ne 0 -or (Get-VersionNumber $wsl.Text) -lt [version]'2.1.5') {
            $msi = Join-Path $script:PayloadRoot 'wsl.x64.msi'
            Assert-Payload 'wsl' $msi
            $arguments = '/i "' + $msi + '" /qn /norestart /L*v "' + (Join-Path $logDirectory 'wsl-msi.log') + '"'
            $install = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\msiexec.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
            if ($install.ExitCode -in @(3010, 1641)) { $restart = $true }
            elseif ($install.ExitCode -ne 0) { throw "WSL MSI failed: $($install.ExitCode)" }
        }
        Stop-Transcript | Out-Null
        if ($restart) { exit 3010 }
        exit 0
    } catch {
        Write-Output $_.Exception.Message
        Stop-Transcript | Out-Null
        exit 1
    }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$script:Busy = $false
$form = New-Object Windows.Forms.Form
$form.Text = 'KubeLab — подготовка системы'; $form.ClientSize = New-Object Drawing.Size(750, 600)
$form.StartPosition = 'CenterScreen'; $form.Font = New-Object Drawing.Font('Segoe UI', 10)
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
$title = New-Object Windows.Forms.Label
$title.Text = 'Подготовим компьютер к практике'; $title.Font = New-Object Drawing.Font('Segoe UI', 17, [Drawing.FontStyle]::Bold)
$title.Location = New-Object Drawing.Point(25, 20); $title.Size = New-Object Drawing.Size(700, 40); $form.Controls.Add($title)
$intro = New-Object Windows.Forms.Label
$intro.Text = "WSL 2, Minikube и kubectl находятся внутри пакета. Docker Desktop скачивается отдельно с сайта Docker. Уже установленные компоненты будут сохранены."
$intro.Location = New-Object Drawing.Point(25, 70); $intro.Size = New-Object Drawing.Size(700, 55); $form.Controls.Add($intro)
$status = New-Object Windows.Forms.TextBox
$status.Multiline = $true; $status.ReadOnly = $true; $status.ScrollBars = 'Vertical'
$status.Location = New-Object Drawing.Point(25, 135); $status.Size = New-Object Drawing.Size(700, 200); $form.Controls.Add($status)
$download = New-Object Windows.Forms.CheckBox
$download.Text = 'Если Docker Desktop отсутствует — скачать и установить (нужен интернет)'
$download.Checked = $true; $download.Location = New-Object Drawing.Point(25, 350); $download.Size = New-Object Drawing.Size(700, 30); $form.Controls.Add($download)
$link = New-Object Windows.Forms.LinkLabel
$link.Text = 'Официальная страница Docker Desktop и условия использования'
$link.Location = New-Object Drawing.Point(25, 390); $link.Size = New-Object Drawing.Size(700, 25)
$link.Add_LinkClicked({ Start-Process -FilePath 'https://docs.docker.com/desktop/setup/install/windows-install/' }); $form.Controls.Add($link)
$note = New-Object Windows.Forms.Label
$note.Text = 'Для WSL могут потребоваться права администратора и перезагрузка. BIOS/UEFI меняется вручную. Образы Kubernetes для первого запуска требуют интернета. Условия Docker принимаются в Docker Desktop.'
$note.Location = New-Object Drawing.Point(25, 430); $note.Size = New-Object Drawing.Size(700, 65); $form.Controls.Add($note)
$installButton = New-Object Windows.Forms.Button
$installButton.Text = 'Установить недостающее'; $installButton.Location = New-Object Drawing.Point(25, 520); $installButton.Size = New-Object Drawing.Size(240, 40); $form.Controls.Add($installButton)
$refreshButton = New-Object Windows.Forms.Button
$refreshButton.Text = 'Проверить снова'; $refreshButton.Location = New-Object Drawing.Point(280, 520); $refreshButton.Size = New-Object Drawing.Size(180, 40); $form.Controls.Add($refreshButton)
$closeButton = New-Object Windows.Forms.Button
$closeButton.Text = 'Закрыть'; $closeButton.Location = New-Object Drawing.Point(545, 520); $closeButton.Size = New-Object Drawing.Size(180, 40); $closeButton.Add_Click({ $form.Close() }); $form.Controls.Add($closeButton)
function Show-State {
    $status.Text = 'Проверяем компоненты...'; [Windows.Forms.Application]::DoEvents()
    $script:State = Get-PrerequisiteState
    $wslText = if ($script:State.WslReady) { "установлен, $($script:State.WslVersion)" } else { 'требуется установка или обновление' }
    $dockerText = if ($script:State.DockerDesktop) { 'установлен — повторная установка не нужна' } else { 'отсутствует — доступно скачивание' }
    $engineText = if ($script:State.DockerEngineReady) { 'работает в режиме Linux containers' } else { 'не готов; запустите Docker Desktop и выберите Linux containers' }
    $status.Text = "Windows build: $($script:State.Build)`r`nWSL 2: $wslText`r`nDocker Desktop: $dockerText`r`nDocker Engine: $engineText`r`nMinikube: встроенная версия $((Get-Package 'minikube').version)`r`nkubectl: встроенная версия $((Get-Package 'kubectl').version)"
}
function Wait-VisibleProcess($Process) {
    while (-not $Process.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 150; $Process.Refresh() }
    $Process.WaitForExit(); return $Process.ExitCode
}
$refreshButton.Add_Click({ Show-State })
$installButton.Add_Click({
    $script:Busy = $true; $installButton.Enabled = $false; $refreshButton.Enabled = $false; $closeButton.Enabled = $false; $download.Enabled = $false
    try {
        Show-State
        if (-not $script:State.X64 -or $script:State.Build -lt 19045 -or ($script:State.Build -ge 22000 -and $script:State.Build -lt 22631)) { throw 'Нужна Windows 10 x64 build 19045 или Windows 11 x64 build 22631 и выше. Windows Server не поддерживается.' }
        $os = Get-CimInstance Win32_OperatingSystem
        if ($os.ProductType -ne 1) { throw 'Docker Desktop не поддерживает Windows Server.' }
        $system = Get-CimInstance Win32_ComputerSystem
        if (-not $system.HypervisorPresent) {
            $cpu = @(Get-CimInstance Win32_Processor)[0]
            if (-not $cpu.VirtualizationFirmwareEnabled) { throw 'Включите аппаратную виртуализацию в BIOS/UEFI, затем повторите подготовку.' }
        }
        Assert-Payload 'minikube' (Join-Path $script:PayloadRoot 'minikube.exe')
        Assert-Payload 'kubectl' (Join-Path $script:PayloadRoot 'kubectl.exe')
        # Always check optional features in the elevated worker, even if WSL is present.
        $status.AppendText("`r`nПроверка и настройка компонентов WSL (запрос UAC)...")
        $arguments = '-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '" -SystemInstall'
        $worker = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru
        $code = Wait-VisibleProcess $worker
        if ($code -eq 3010 -or $code -eq 1641) {
            [Windows.Forms.MessageBox]::Show('Компоненты WSL подготовлены. Перезагрузите Windows, затем откройте KubeLab → «Настройка системы» и продолжите. Автоматической перезагрузки не будет.', 'Нужна перезагрузка') | Out-Null
            return
        }
        if ($code -ne 0) { throw "Настройка WSL не завершена (код $code). Журнал: $env:ProgramData\KubeLab\Setup\prerequisites.log. Если Windows требует исходники компонентов, добавьте их через обслуживание Windows." }
        if (-not (Find-DockerDesktop) -and $download.Checked) {
            $package = Get-Package 'docker'
            $folder = Join-Path $env:LOCALAPPDATA 'KubeLab\Downloads'; New-Item -ItemType Directory -Force -Path $folder | Out-Null
            $file = Join-Path $folder $package.file
            $status.AppendText("`r`nСкачиваем Docker Desktop с desktop.docker.com. Это может занять несколько минут...")
            [Windows.Forms.Application]::DoEvents()
            if (-not (Test-Path -LiteralPath $file)) {
                # BITS runs the transfer outside the UI thread; no shell-supplied URL.
                Import-Module BitsTransfer
                $job = Start-BitsTransfer -Source $package.url -Destination ($file + '.partial') -Asynchronous
                try {
                    while ($job.JobState -in @('Connecting', 'Transferring', 'Queued')) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 300 }
                    if ($job.JobState -ne 'Transferred') { throw "Download failed: $($job.JobState). $($job.ErrorDescription)" }
                    Complete-BitsTransfer -BitsJob $job
                    Move-Item -LiteralPath ($file + '.partial') -Destination $file -Force
                } catch { Remove-BitsTransfer -BitsJob $job -ErrorAction SilentlyContinue; throw }
            }
            Assert-Payload 'docker' $file
            $status.AppendText("`r`nЗапускаем официальный установщик Docker Desktop...")
            # Keep license acceptance in the official product. Do not pass --accept-license.
            $docker = Start-Process -FilePath $file -ArgumentList @('install', '--user', '--backend=wsl-2') -PassThru
            $dockerCode = Wait-VisibleProcess $docker
            if ($dockerCode -notin @(0, 3010, 1641)) { throw "Установщик Docker Desktop завершился с кодом $dockerCode." }
            if ($dockerCode -in @(3010, 1641)) { [Windows.Forms.MessageBox]::Show('Для завершения установки Docker перезагрузите Windows.', 'Нужна перезагрузка') | Out-Null }
        }
        Show-State
        if ($script:State.DockerDesktop) {
            $status.AppendText("`r`nКомпоненты установлены. Запустите Docker Desktop, примите его условия и дождитесь готовности Engine. Затем используйте реальный режим консоли.")
        } else { $status.AppendText("`r`nDocker Desktop ещё не установлен. Используйте ссылку выше или включите скачивание. Тренажёр доступен без Docker.") }
    } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Подготовка не завершена', 'OK', 'Warning') | Out-Null }
    finally { $script:Busy = $false; $installButton.Enabled = $true; $refreshButton.Enabled = $true; $closeButton.Enabled = $true; $download.Enabled = $true }
})
$form.Add_FormClosing({ param($sender, $eventArgs) if ($script:Busy) { $eventArgs.Cancel = $true } })
$form.Add_Shown({ Show-State })
[void]$form.ShowDialog()
