param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked {
    param([string]$Tool, [string[]]$Arguments)
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Tool failed with exit code $LASTEXITCODE" }
}
foreach ($tool in @('docker', 'minikube', 'kubectl')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Install $tool and restart PowerShell." }
}
Invoke-Checked docker @('info', '--format', '{{.OSType}}')
if (-not $SkipBuild) { Invoke-Checked docker @('build', '-t', 'kubelab:1.0', '.') }
Invoke-Checked minikube @('start', '-p', 'kubelab', '--driver=docker', '--cpus=2', '--memory=3072')
Invoke-Checked minikube @('image', 'load', 'kubelab:1.0', '-p', 'kubelab')
Invoke-Checked kubectl @('--context', 'kubelab', 'apply', '-f', 'k8s/lab.yaml')
Invoke-Checked kubectl @('--context', 'kubelab', '-n', 'kubelab', 'rollout', 'status', 'deployment/kubelab', '--timeout=120s')
Write-Host 'Open http://localhost:8081 while this terminal is running. Ctrl+C stops the tunnel.'
Invoke-Checked kubectl @('--context', 'kubelab', '-n', 'kubelab', 'port-forward', 'service/kubelab', '8081:80')
