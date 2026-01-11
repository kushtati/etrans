# TransitGuinee - Test de Sante Automatise
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   TransitGuinee - Health Check" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$allOk = $true

# Test 1: PostgreSQL
Write-Host "[1/6] Test PostgreSQL (port 5433)..." -NoNewline
try {
    $pg = Get-NetTCPConnection -LocalPort 5433 -ErrorAction Stop
    Write-Host " OK" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "      Demarrez Docker: docker-compose up -d" -ForegroundColor Yellow
    $allOk = $false
}

# Test 2: Redis
Write-Host "[2/6] Test Redis (port 6379)..." -NoNewline
try {
    $redis = Get-NetTCPConnection -LocalPort 6379 -ErrorAction Stop
    Write-Host " OK" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "      Demarrez Docker: docker-compose up -d" -ForegroundColor Yellow
    $allOk = $false
}

# Test 3: Backend
Write-Host "[3/6] Test Backend (port 3001)..." -NoNewline
try {
    $backend = Get-NetTCPConnection -LocalPort 3001 -ErrorAction Stop
    Write-Host " OK" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "      Demarrez: npm run dev" -ForegroundColor Yellow
    $allOk = $false
}

# Test 4: Frontend
Write-Host "[4/6] Test Frontend (port 5173)..." -NoNewline
try {
    $frontend = Get-NetTCPConnection -LocalPort 5173 -ErrorAction Stop
    Write-Host " OK" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "      Demarrez: npm run dev" -ForegroundColor Yellow
    $allOk = $false
}

# Test 5: Endpoint CSRF
Write-Host "[5/6] Test API CSRF..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/csrf-token" -Method Get -ErrorAction Stop -TimeoutSec 5
    if ($response.token) {
        $tokenPreview = $response.token.Substring(0, [Math]::Min(16, $response.token.Length))
        Write-Host " OK (Token: $tokenPreview...)" -ForegroundColor Green
    } else {
        Write-Host " FAIL (Pas de token)" -ForegroundColor Red
        $allOk = $false
    }
} catch {
    Write-Host " FAIL ($($_.Exception.Message))" -ForegroundColor Red
    $allOk = $false
}

# Test 6: Endpoint Me (doit etre 401)
Write-Host "[6/6] Test API Me (expect 401)..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/me" -Method Get -ErrorAction Stop -TimeoutSec 5
    Write-Host " FAIL (Devrait retourner 401, recu $($response.StatusCode))" -ForegroundColor Red
    $allOk = $false
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host " OK (401 Unauthorized)" -ForegroundColor Green
    } else {
        Write-Host " FAIL (Status: $($_.Exception.Response.StatusCode))" -ForegroundColor Red
        $allOk = $false
    }
}

# Resultat final
Write-Host "`n========================================" -ForegroundColor Cyan
if ($allOk) {
    Write-Host "   TOUS LES TESTS PASSENT" -ForegroundColor Green
    Write-Host "   Application prete a l'emploi!" -ForegroundColor Green
    Write-Host "`n   Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "   Backend:  http://127.0.0.1:3001" -ForegroundColor Cyan
} else {
    Write-Host "   CERTAINS TESTS ECHOUENT" -ForegroundColor Red
    Write-Host "   Verifiez les erreurs ci-dessus" -ForegroundColor Yellow
}
Write-Host "========================================`n" -ForegroundColor Cyan

# Retourner code sortie
if ($allOk) { exit 0 } else { exit 1 }
