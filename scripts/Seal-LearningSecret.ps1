$ErrorActionPreference = 'Stop'
if (-not (Get-Command kubeseal -ErrorAction SilentlyContinue)) { throw 'Установите kubeseal по официальной инструкции Sealed Secrets.' }
$taskState = Join-Path (Get-Location) '.lab-state'
New-Item -ItemType Directory -Force -Path $taskState | Out-Null
$taskObject = '{"apiVersion":"v1","kind":"Secret","metadata":{"name":"sealed-demo","namespace":"kubelab-deep"},"type":"Opaque","stringData":{"DEMO_TOKEN":"fictional-learning-only"}}'
$taskSealed = $taskObject | kubeseal --context kubelab-deep --controller-name sealed-secrets-controller --controller-namespace kube-system --scope strict --format yaml
if ($LASTEXITCODE -ne 0) { throw 'kubeseal завершился с ошибкой. Файл не записан.' }
[IO.File]::WriteAllText((Join-Path $taskState 'sealed-demo.yaml'), ($taskSealed -join "`n"), [Text.UTF8Encoding]::new($false))
Write-Output 'Создан .lab-state/sealed-demo.yaml. Открытое значение не сохранялось.'
