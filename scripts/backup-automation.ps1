# Automated backup script for Article Manager PostgreSQL database (PowerShell/Windows)
# This script can be run manually or scheduled via Task Scheduler for regular backups

param(
    [string]$Command = "backup",
    [string]$BackupDir = "./backups",
    [int]$RetentionDays = 30,
    [bool]$CompressBackups = $true,
    [string]$BackupPrefix = "article-manager"
)

$ErrorActionPreference = "Stop"

# Database configuration from environment
$DbHost = $env:DB_HOST ?? "localhost"
$DbPort = $env:DB_PORT ?? "5432"
$DbName = $env:DB_NAME ?? "article_manager"
$DbUser = $env:DB_USER ?? "article_user"
$DbPassword = $env:DB_PASSWORD ?? $env:PGPASSWORD

# Logging functions
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor Blue
}

function Write-Error-Log {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning-Log {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

# Check if required tools are available
function Test-Dependencies {
    $missingTools = @()
    
    try {
        $null = Get-Command pg_dump -ErrorAction Stop
    }
    catch {
        $missingTools += "pg_dump"
    }
    
    if ($CompressBackups) {
        try {
            $null = Get-Command 7z -ErrorAction SilentlyContinue
            if (-not $?) {
                # Try built-in Compress-Archive as fallback
                try {
                    $null = Get-Command Compress-Archive -ErrorAction Stop
                }
                catch {
                    $missingTools += "7z or Compress-Archive"
                }
            }
        }
        catch {
            $missingTools += "7z"
        }
    }
    
    if ($missingTools.Count -gt 0) {
        Write-Error-Log "Missing required tools: $($missingTools -join ', ')"
        Write-Error-Log "Please install PostgreSQL client tools and 7-Zip (optional for compression)"
        exit 1
    }
}

# Create backup directory if it doesn't exist
function Initialize-BackupDirectory {
    if (-not (Test-Path $BackupDir)) {
        Write-Log "Creating backup directory: $BackupDir"
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    }
    
    # Test if directory is writable
    $testFile = Join-Path $BackupDir "test_write.tmp"
    try {
        "test" | Out-File -FilePath $testFile -ErrorAction Stop
        Remove-Item $testFile -ErrorAction SilentlyContinue
    }
    catch {
        Write-Error-Log "Backup directory is not writable: $BackupDir"
        exit 1
    }
}

# Generate backup filename with timestamp
function Get-BackupFilename {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $filename = "${BackupPrefix}_${timestamp}.sql"
    
    if ($CompressBackups) {
        $filename += ".zip"
    }
    
    return Join-Path $BackupDir $filename
}

# Create database backup
function New-DatabaseBackup {
    param([string]$BackupFile)
    
    $tempFile = "$BackupFile.tmp"
    
    Write-Log "Creating database backup..."
    Write-Log "Database: ${DbHost}:${DbPort}/${DbName}"
    Write-Log "Output: $BackupFile"
    
    try {
        # Set password environment variable
        $env:PGPASSWORD = $DbPassword
        
        # Build pg_dump arguments
        $pgDumpArgs = @(
            "--host=$DbHost",
            "--port=$DbPort",
            "--username=$DbUser",
            "--dbname=$DbName",
            "--verbose",
            "--no-password",
            "--format=plain",
            "--no-privileges",
            "--no-owner"
        )
        
        # Execute backup
        if ($CompressBackups) {
            # Create uncompressed backup first
            $sqlFile = $tempFile -replace '\.zip$', ''
            & pg_dump @pgDumpArgs --file="$sqlFile"
            
            if ($LASTEXITCODE -ne 0) {
                throw "pg_dump failed with exit code $LASTEXITCODE"
            }
            
            # Compress the backup
            if (Get-Command 7z -ErrorAction SilentlyContinue) {
                & 7z a "$tempFile" "$sqlFile" | Out-Null
                Remove-Item "$sqlFile" -ErrorAction SilentlyContinue
            }
            else {
                Compress-Archive -Path "$sqlFile" -DestinationPath "$tempFile"
                Remove-Item "$sqlFile" -ErrorAction SilentlyContinue
            }
        }
        else {
            & pg_dump @pgDumpArgs --file="$tempFile"
            
            if ($LASTEXITCODE -ne 0) {
                throw "pg_dump failed with exit code $LASTEXITCODE"
            }
        }
        
        # Move temp file to final location
        Move-Item $tempFile $BackupFile
        
        # Verify backup file was created and has content
        if (-not (Test-Path $BackupFile) -or (Get-Item $BackupFile).Length -eq 0) {
            throw "Backup file is empty or was not created"
        }
        
        $fileSize = [math]::Round((Get-Item $BackupFile).Length / 1MB, 2)
        Write-Success "Backup created successfully: $BackupFile ($fileSize MB)"
        
        return $true
    }
    catch {
        Write-Error-Log "Backup failed: $($_.Exception.Message)"
        Remove-Item $tempFile -ErrorAction SilentlyContinue
        return $false
    }
    finally {
        # Clear password from environment
        $env:PGPASSWORD = $null
    }
}

# Clean up old backups based on retention policy
function Remove-OldBackups {
    Write-Log "Cleaning up backups older than $RetentionDays days..."
    
    $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
    $deletedCount = 0
    
    Get-ChildItem -Path $BackupDir -Filter "${BackupPrefix}_*.sql*" | 
        Where-Object { $_.LastWriteTime -lt $cutoffDate } |
        ForEach-Object {
            Write-Log "Deleting old backup: $($_.Name)"
            Remove-Item $_.FullName -Force
            $deletedCount++
        }
    
    if ($deletedCount -gt 0) {
        Write-Success "Deleted $deletedCount old backup(s)"
    }
    else {
        Write-Log "No old backups to clean up"
    }
}

# List existing backups
function Show-Backups {
    Write-Log "Existing backups in $BackupDir:"
    
    $backupFiles = Get-ChildItem -Path $BackupDir -Filter "${BackupPrefix}_*.sql*" | Sort-Object LastWriteTime
    
    if ($backupFiles.Count -eq 0) {
        Write-Log "No backups found"
        return
    }
    
    foreach ($file in $backupFiles) {
        $size = [math]::Round($file.Length / 1MB, 2)
        $date = $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        Write-Log "  $($file.Name) - $size MB - $date"
    }
}

# Verify database connectivity before backup
function Test-DatabaseConnection {
    Write-Log "Verifying database connection..."
    
    try {
        $env:PGPASSWORD = $DbPassword
        & pg_isready -h $DbHost -p $DbPort -U $DbUser -d $DbName | Out-Null
        
        if ($LASTEXITCODE -ne 0) {
            throw "pg_isready failed"
        }
        
        Write-Success "Database connection verified"
        return $true
    }
    catch {
        Write-Error-Log "Cannot connect to database: ${DbHost}:${DbPort}/${DbName}"
        Write-Error-Log "Please check database configuration and ensure it's running"
        return $false
    }
    finally {
        $env:PGPASSWORD = $null
    }
}

# Main backup function
function Invoke-Backup {
    $backupFile = Get-BackupFilename
    
    if (New-DatabaseBackup -BackupFile $backupFile) {
        Remove-OldBackups
        return $true
    }
    else {
        return $false
    }
}

# Show usage information
function Show-Usage {
    Write-Host "Article Manager Database Backup Automation (PowerShell)" -ForegroundColor Magenta
    Write-Host "Usage: .\backup-automation.ps1 [-Command <command>] [options]" -ForegroundColor White
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  backup    Create a new database backup (default)" -ForegroundColor White
    Write-Host "  list      List existing backups" -ForegroundColor White
    Write-Host "  cleanup   Clean up old backups only" -ForegroundColor White
    Write-Host "  verify    Verify database connection" -ForegroundColor White
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Cyan
    Write-Host "  -BackupDir         Backup directory (default: ./backups)" -ForegroundColor White
    Write-Host "  -RetentionDays     Days to keep backups (default: 30)" -ForegroundColor White
    Write-Host "  -CompressBackups   Compress backups with zip (default: true)" -ForegroundColor White
    Write-Host "  -BackupPrefix      Backup filename prefix (default: article-manager)" -ForegroundColor White
    Write-Host ""
    Write-Host "Environment Variables:" -ForegroundColor Cyan
    Write-Host "  DB_HOST           Database host (default: localhost)" -ForegroundColor White
    Write-Host "  DB_PORT           Database port (default: 5432)" -ForegroundColor White
    Write-Host "  DB_NAME           Database name (default: article_manager)" -ForegroundColor White
    Write-Host "  DB_USER           Database user (default: article_user)" -ForegroundColor White
    Write-Host "  DB_PASSWORD       Database password (required)" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\backup-automation.ps1                                    # Create backup" -ForegroundColor White
    Write-Host "  .\backup-automation.ps1 -Command list                      # List backups" -ForegroundColor White
    Write-Host "  .\backup-automation.ps1 -Command cleanup -RetentionDays 7  # Clean old backups" -ForegroundColor White
}

# Main script logic
function Main {
    switch ($Command.ToLower()) {
        "backup" {
            Test-Dependencies
            Initialize-BackupDirectory
            if (Test-DatabaseConnection) {
                Invoke-Backup
                Show-Backups
            }
            else {
                exit 1
            }
        }
        "list" {
            Initialize-BackupDirectory
            Show-Backups
        }
        "cleanup" {
            Initialize-BackupDirectory
            Remove-OldBackups
        }
        "verify" {
            if (-not (Test-DatabaseConnection)) {
                exit 1
            }
        }
        "help" {
            Show-Usage
        }
        default {
            Write-Error-Log "Unknown command: $Command"
            Show-Usage
            exit 1
        }
    }
}

# Handle script interruption
trap {
    Write-Host ""
    Write-Error-Log "Backup interrupted"
    exit 1
}

# Check for required environment variables
if (-not $DbPassword) {
    Write-Error-Log "Database password not set. Please set DB_PASSWORD environment variable"
    exit 1
}

# Run main function
try {
    Main
}
catch {
    Write-Error-Log "Script failed: $($_.Exception.Message)"
    exit 1
}