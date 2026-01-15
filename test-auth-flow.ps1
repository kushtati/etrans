<#
.SYNOPSIS
    Test complet du flow d'authentification cross-domain (Vercel ↔ Railway)

.DESCRIPTION
    Teste le parcours complet :
    1. GET /api/auth/csrf-token → Récupérer 2 cookies (csrf_session + XSRF-TOKEN)
    2. POST /api/auth/login → Authentification avec cookies
    3. GET /api/auth/me → Vérifier session
    4. POST /api/auth/logout → Déconnexion

.PARAMETER BaseUrl
    URL du backend Railway (défaut: https://etrans-production.up.railway.app)

.PARAMETER Origin
    Origin du frontend Vercel (défaut: https://etrans-eight.vercel.app)

.EXAMPLE
    .\test-auth-flow.ps1
    .\test-auth-flow.ps1 -BaseUrl "http://localhost:8080"
#>

param(
    [string]$BaseUrl = "https://etrans-production.up.railway.app",
    [string]$Origin = "https://etrans-eight.vercel.app"
)

Write-Host "`n═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🧪 TEST FLOW AUTHENTIFICATION CROSS-DOMAIN" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Backend: $BaseUrl" -ForegroundColor White
Write-Host "Origin: $Origin`n" -ForegroundColor White

# Session pour préserver cookies entre requêtes
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers = @{
    "Origin" = $Origin
}

# Test 1: Récupérer token CSRF
Write-Host "🔐 Test 1: GET /api/auth/csrf-token" -ForegroundColor Yellow
try {
    $csrfResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/csrf-token" `
        -Headers $headers `
        -WebSession $session `
        -UseBasicParsing
    
    $csrfData = $csrfResponse.Content | ConvertFrom-Json
    $cookies = $session.Cookies.GetCookies($BaseUrl)
    
    Write-Host "   Status: $($csrfResponse.StatusCode)" -ForegroundColor White
    Write-Host "   Token: $($csrfData.token.Substring(0, 20))..." -ForegroundColor White
    Write-Host "   Cookies:" -ForegroundColor White
    foreach ($cookie in $cookies) {
        Write-Host "      - $($cookie.Name)" -ForegroundColor Gray
    }
    
    if ($csrfResponse.StatusCode -ne 200) {
        throw "CSRF token fetch failed: $($csrfResponse.StatusCode)"
    }
    
    $hasCsrfSession = $false
    $hasXsrfToken = $false
    foreach ($cookie in $cookies) {
        if ($cookie.Name -eq "csrf_session") { $hasCsrfSession = $true }
        if ($cookie.Name -eq "XSRF-TOKEN") { $hasXsrfToken = $true }
    }
    
    if (-not $hasCsrfSession) {
        throw "Cookie csrf_session missing"
    }
    if (-not $hasXsrfToken) {
        throw "Cookie XSRF-TOKEN missing"
    }
    
    Write-Host "   ✅ CSRF token OK`n" -ForegroundColor Green
    
} catch {
    Write-Host "   ❌ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Login
Write-Host "🔑 Test 2: POST /api/auth/login" -ForegroundColor Yellow
try {
    $loginHeaders = @{
        "Origin" = $Origin
        "Content-Type" = "application/json"
        "X-CSRF-Token" = $csrfData.token
    }
    
    $loginBody = @{
        email = "admin@transit.gn"
        password = "AdminSecure123!"
        isHashed = $false
    } | ConvertTo-Json
    
    $loginResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" `
        -Method POST `
        -Headers $loginHeaders `
        -Body $loginBody `
        -WebSession $session `
        -UseBasicParsing
    
    $loginData = $loginResponse.Content | ConvertFrom-Json
    $cookies = $session.Cookies.GetCookies($BaseUrl)
    
    Write-Host "   Status: $($loginResponse.StatusCode)" -ForegroundColor White
    Write-Host "   User: $($loginData.user.email) ($($loginData.user.role))" -ForegroundColor White
    Write-Host "   Cookies:" -ForegroundColor White
    foreach ($cookie in $cookies) {
        Write-Host "      - $($cookie.Name)" -ForegroundColor Gray
    }
    
    if ($loginResponse.StatusCode -ne 200) {
        throw "Login failed: $($loginData.message)"
    }
    
    $hasAuthToken = $false
    foreach ($cookie in $cookies) {
        if ($cookie.Name -eq "auth_token") { $hasAuthToken = $true }
    }
    
    if (-not $hasAuthToken) {
        throw "Cookie auth_token missing"
    }
    
    Write-Host "   ✅ Login OK`n" -ForegroundColor Green
    
} catch {
    Write-Host "   ❌ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "   Body: $body" -ForegroundColor Red
    }
    exit 1
}

# Test 3: Vérifier session
Write-Host "👤 Test 3: GET /api/auth/me" -ForegroundColor Yellow
try {
    $meResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/me" `
        -Headers $headers `
        -WebSession $session `
        -UseBasicParsing
    
    $meData = $meResponse.Content | ConvertFrom-Json
    
    Write-Host "   Status: $($meResponse.StatusCode)" -ForegroundColor White
    Write-Host "   User: $($meData.email) ($($meData.role))" -ForegroundColor White
    
    if ($meResponse.StatusCode -ne 200) {
        throw "Session check failed"
    }
    
    Write-Host "   ✅ Session OK`n" -ForegroundColor Green
    
} catch {
    Write-Host "   ❌ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 4: Logout
Write-Host "🚪 Test 4: POST /api/auth/logout" -ForegroundColor Yellow
try {
    $logoutHeaders = @{
        "Origin" = $Origin
        "Content-Type" = "application/json"
        "X-CSRF-Token" = $csrfData.token
    }
    
    $logoutResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/logout" `
        -Method POST `
        -Headers $logoutHeaders `
        -WebSession $session `
        -UseBasicParsing
    
    $logoutData = $logoutResponse.Content | ConvertFrom-Json
    
    Write-Host "   Status: $($logoutResponse.StatusCode)" -ForegroundColor White
    Write-Host "   Message: $($logoutData.message)" -ForegroundColor White
    
    if ($logoutResponse.StatusCode -ne 200) {
        throw "Logout failed"
    }
    
    Write-Host "   ✅ Logout OK`n" -ForegroundColor Green
    
} catch {
    Write-Host "   ❌ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ TOUS LES TESTS RÉUSSIS !" -ForegroundColor Green
Write-Host "═══════════════════════════════════════`n" -ForegroundColor Cyan

exit 0
