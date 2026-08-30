# Starts the backend and the frontend, each in its own window.
#
# Run it from the project root:
#
#     .\start.ps1
#
# It checks the things that usually go wrong first, and says which one is
# broken, rather than opening two windows that both immediately fail.
#
# Two windows rather than one on purpose: you can watch the backend's request
# log while using the site, and stopping one does not stop the other.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Fail($message, $fix) {
    Write-Host "  FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "  $message" -ForegroundColor Red
    Write-Host "  Fix: $fix"
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Insta Clone" -ForegroundColor Cyan
Write-Host ""

# --- 1. the Python virtual environment ------------------------------------
Write-Host "  checking backend venv...... " -NoNewline
$python = Join-Path $root 'backend\venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    Fail "backend\venv is missing." "cd backend; python -m venv venv; .\venv\Scripts\activate; pip install -r requirements.txt"
}
Write-Host "ok" -ForegroundColor Green

# --- 2. the secrets file --------------------------------------------------
Write-Host "  checking backend\.env..... " -NoNewline
$envFile = Join-Path $root 'backend\.env'
if (-not (Test-Path $envFile)) {
    Fail "backend\.env is missing." "copy backend\.env.example to backend\.env and fill it in"
}
$envText = Get-Content $envFile -Raw
if ($envText -match 'your_password_here' -or $envText -match 'run_the_command_above') {
    Fail "backend\.env still contains placeholder values." "open backend\.env and replace them with real values"
}
Write-Host "ok" -ForegroundColor Green

# --- 3. can we actually reach the database? -------------------------------
# This is the check worth having. Everything else can be right while
# PostgreSQL is simply switched off, and the error you get then is confusing.
Write-Host "  checking database......... " -NoNewline
Push-Location (Join-Path $root 'backend')
try {
    & $python -c "from sqlalchemy import text; from app.database import engine; engine.connect().execute(text('SELECT 1'))" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Fail "Cannot connect to PostgreSQL." "check PostgreSQL is running, and that DATABASE_URL in backend\.env is correct"
    }
} finally {
    if ((Get-Location).Path -ne $root) { Pop-Location }
}
Write-Host "ok" -ForegroundColor Green

# --- 4. frontend packages -------------------------------------------------
Write-Host "  checking node_modules..... " -NoNewline
if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) {
    Fail "frontend\node_modules is missing." "cd frontend; npm install"
}
Write-Host "ok" -ForegroundColor Green

# --- 5. is anything already using the ports? ------------------------------
# Worth checking, because on Windows a taken port reports as "access
# forbidden" (WinError 10013), which sends people looking at firewalls
# instead of at the server they left running.
foreach ($port in 8000, 5173) {
    $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($inUse) {
        $owner = (Get-Process -Id $inUse[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-Host ""
        Write-Host "  Port $port is already in use by PID $($inUse[0].OwningProcess) ($owner)." -ForegroundColor Yellow
        Write-Host "  It is probably a server you already started."
        Write-Host "  Stop it with:  Stop-Process -Id $($inUse[0].OwningProcess) -Force"
        Write-Host ""
        exit 1
    }
}

# --- start both -----------------------------------------------------------
Write-Host ""
Write-Host "  starting backend  -> http://localhost:8000"
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root\backend'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
)

Write-Host "  starting frontend -> http://localhost:5173"
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "  Open http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Use localhost, not 127.0.0.1 - Vite listens on IPv6 only."
Write-Host ""
Write-Host "  API docs: http://localhost:8000/docs"
Write-Host "  Stop each server with Ctrl+C in its own window."
Write-Host ""
