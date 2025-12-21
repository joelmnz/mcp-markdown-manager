# Production deployment script for Article Manager (PowerShell/Windows)
# This script handles the complete deployment process including database setup

param(
    [switch]$SkipBuild,
    [switch]$SkipHealthCheck,
    [string]$ConfigFile = ".env"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Article Manager production deployment..." -ForegroundColor Green

# Check if required environment variables are set
function Test-EnvironmentVariables {
    $requiredVars = @("AUTH_TOKEN", "DB_PASSWORD")
    $missingVars = @()
    
    foreach ($var in $requiredVars) {
        if (-not (Get-Variable -Name $var -ErrorAction SilentlyContinue) -and -not $env:$var) {
            $missingVars += $var
        }
    }
    
    if ($missingVars.Count -gt 0) {
        Write-Host "❌ Missing required environment variables:" -ForegroundColor Red
        $missingVars | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        Write-Host "Please set these variables and try again." -ForegroundColor Red
        exit 1
    }
}

# Build the application
function Build-Application {
    if ($SkipBuild) {
        Write-Host "⏭️  Skipping build step" -ForegroundColor Yellow
        return
    }
    
    Write-Host "📦 Building application..." -ForegroundColor Blue
    bun install --frozen-lockfile
    bun run build
    Write-Host "✅ Application built successfully" -ForegroundColor Green
}

# Start database and wait for it to be ready
function Start-Database {
    Write-Host "🗄️  Starting PostgreSQL database..." -ForegroundColor Blue
    docker-compose up -d postgres
    
    Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
    $maxAttempts = 30
    $attempt = 1
    
    while ($attempt -le $maxAttempts) {
        try {
            $result = docker-compose exec -T postgres pg_isready -U article_user -d article_manager 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Database is ready" -ForegroundColor Green
                return
            }
        }
        catch {
            # Continue trying
        }
        
        Write-Host "   Attempt $attempt/$maxAttempts - waiting for database..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
        $attempt++
    }
    
    Write-Host "❌ Database failed to start within expected time" -ForegroundColor Red
    docker-compose logs postgres
    exit 1
}

# Initialize database schema
function Initialize-Database {
    Write-Host "🔧 Initializing database schema..." -ForegroundColor Blue
    
    # Run database initialization
    try {
        bun run db:init
        Write-Host "✅ Database schema initialized" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Database initialization failed" -ForegroundColor Red
        exit 1
    }
    
    if (-not $SkipHealthCheck) {
        # Verify database health
        Write-Host "🔍 Verifying database health..." -ForegroundColor Blue
        try {
            bun run db:health
            Write-Host "✅ Database health check passed" -ForegroundColor Green
        }
        catch {
            Write-Host "❌ Database health check failed" -ForegroundColor Red
            exit 1
        }
    }
}

# Start the full application
function Start-Application {
    Write-Host "🚀 Starting full application..." -ForegroundColor Blue
    docker-compose up -d
    
    Write-Host "⏳ Waiting for application to be ready..." -ForegroundColor Yellow
    $maxAttempts = 20
    $attempt = 1
    
    while ($attempt -le $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ Application is ready and healthy" -ForegroundColor Green
                return
            }
        }
        catch {
            # Continue trying
        }
        
        Write-Host "   Attempt $attempt/$maxAttempts - waiting for application..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
        $attempt++
    }
    
    Write-Host "❌ Application failed to start within expected time" -ForegroundColor Red
    docker-compose logs article-manager
    exit 1
}

# Create backup directory
function Setup-BackupDirectory {
    Write-Host "📁 Setting up backup directory..." -ForegroundColor Blue
    if (-not (Test-Path "./backups")) {
        New-Item -ItemType Directory -Path "./backups" -Force | Out-Null
    }
    Write-Host "✅ Backup directory ready" -ForegroundColor Green
}

# Display deployment summary
function Show-DeploymentSummary {
    Write-Host ""
    Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Application Status:" -ForegroundColor Cyan
    Write-Host "   - Web UI: http://localhost:5000" -ForegroundColor White
    Write-Host "   - Health Check: http://localhost:5000/health" -ForegroundColor White
    Write-Host "   - Database: PostgreSQL on localhost:5432" -ForegroundColor White
    Write-Host ""
    Write-Host "🔧 Management Commands:" -ForegroundColor Cyan
    Write-Host "   - View logs: docker-compose logs -f" -ForegroundColor White
    Write-Host "   - Stop: docker-compose down" -ForegroundColor White
    Write-Host "   - Manual backup: bun run db:backup" -ForegroundColor White
    Write-Host "   - Automated backup: bun run db:backup:auto:windows" -ForegroundColor White
    Write-Host "   - List backups: bun run db:backup:list" -ForegroundColor White
    Write-Host "   - Health check: bun run db:health" -ForegroundColor White
    Write-Host ""
    Write-Host "📚 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Test the application at http://localhost:5000" -ForegroundColor White
    Write-Host "   2. Import existing data: bun run import import ./data" -ForegroundColor White
    Write-Host "   3. Set up regular backups" -ForegroundColor White
    Write-Host "   4. Configure monitoring and alerts" -ForegroundColor White
}

# Main deployment process
function Main {
    Write-Host "Article Manager Production Deployment" -ForegroundColor Magenta
    Write-Host "=====================================" -ForegroundColor Magenta
    
    Test-EnvironmentVariables
    Build-Application
    Setup-BackupDirectory
    Start-Database
    Initialize-Database
    Start-Application
    Show-DeploymentSummary
}

# Handle script interruption
trap {
    Write-Host "❌ Deployment interrupted" -ForegroundColor Red
    docker-compose down
    exit 1
}

# Run main function
try {
    Main
}
catch {
    Write-Host "❌ Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    docker-compose down
    exit 1
}