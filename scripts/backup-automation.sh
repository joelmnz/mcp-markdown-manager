#!/bin/bash

# Automated backup script for Article Manager PostgreSQL database
# This script can be run manually or scheduled via cron for regular backups

set -e  # Exit on any error

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESS_BACKUPS="${COMPRESS_BACKUPS:-true}"
BACKUP_PREFIX="${BACKUP_PREFIX:-article-manager}"

# Database configuration from environment
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-article_manager}"
DB_USER="${DB_USER:-article_user}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if required tools are available
check_dependencies() {
    local missing_tools=()
    
    if ! command -v pg_dump >/dev/null 2>&1; then
        missing_tools+=("pg_dump")
    fi
    
    if [[ "$COMPRESS_BACKUPS" == "true" ]] && ! command -v gzip >/dev/null 2>&1; then
        missing_tools+=("gzip")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        error "Missing required tools: ${missing_tools[*]}"
        error "Please install PostgreSQL client tools"
        exit 1
    fi
}

# Create backup directory if it doesn't exist
setup_backup_directory() {
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
    
    # Ensure directory is writable
    if [[ ! -w "$BACKUP_DIR" ]]; then
        error "Backup directory is not writable: $BACKUP_DIR"
        exit 1
    fi
}

# Generate backup filename with timestamp
generate_backup_filename() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local filename="${BACKUP_PREFIX}_${timestamp}.sql"
    
    if [[ "$COMPRESS_BACKUPS" == "true" ]]; then
        filename="${filename}.gz"
    fi
    
    echo "${BACKUP_DIR}/${filename}"
}

# Create database backup
create_backup() {
    local backup_file="$1"
    local temp_file="${backup_file}.tmp"
    
    log "Creating database backup..."
    log "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
    log "Output: $backup_file"
    
    # Build pg_dump command
    local pg_dump_cmd="pg_dump"
    pg_dump_cmd+=" --host=$DB_HOST"
    pg_dump_cmd+=" --port=$DB_PORT"
    pg_dump_cmd+=" --username=$DB_USER"
    pg_dump_cmd+=" --dbname=$DB_NAME"
    pg_dump_cmd+=" --verbose"
    pg_dump_cmd+=" --no-password"
    pg_dump_cmd+=" --format=plain"
    pg_dump_cmd+=" --no-privileges"
    pg_dump_cmd+=" --no-owner"
    
    # Execute backup with optional compression
    if [[ "$COMPRESS_BACKUPS" == "true" ]]; then
        if $pg_dump_cmd | gzip > "$temp_file"; then
            mv "$temp_file" "$backup_file"
        else
            rm -f "$temp_file"
            error "Backup failed"
            return 1
        fi
    else
        if $pg_dump_cmd > "$temp_file"; then
            mv "$temp_file" "$backup_file"
        else
            rm -f "$temp_file"
            error "Backup failed"
            return 1
        fi
    fi
    
    # Verify backup file was created and has content
    if [[ ! -f "$backup_file" ]] || [[ ! -s "$backup_file" ]]; then
        error "Backup file is empty or was not created"
        return 1
    fi
    
    local file_size=$(du -h "$backup_file" | cut -f1)
    success "Backup created successfully: $backup_file ($file_size)"
    
    return 0
}

# Clean up old backups based on retention policy
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    local deleted_count=0
    
    # Find and delete old backup files
    while IFS= read -r -d '' file; do
        log "Deleting old backup: $(basename "$file")"
        rm "$file"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR" -name "${BACKUP_PREFIX}_*.sql*" -type f -mtime +$RETENTION_DAYS -print0 2>/dev/null)
    
    if [[ $deleted_count -gt 0 ]]; then
        success "Deleted $deleted_count old backup(s)"
    else
        log "No old backups to clean up"
    fi
}

# List existing backups
list_backups() {
    log "Existing backups in $BACKUP_DIR:"
    
    local backup_files=()
    while IFS= read -r -d '' file; do
        backup_files+=("$file")
    done < <(find "$BACKUP_DIR" -name "${BACKUP_PREFIX}_*.sql*" -type f -print0 2>/dev/null | sort -z)
    
    if [[ ${#backup_files[@]} -eq 0 ]]; then
        log "No backups found"
        return
    fi
    
    for file in "${backup_files[@]}"; do
        local size=$(du -h "$file" | cut -f1)
        local date=$(date -r "$file" '+%Y-%m-%d %H:%M:%S')
        log "  $(basename "$file") - $size - $date"
    done
}

# Verify database connectivity before backup
verify_database_connection() {
    log "Verifying database connection..."
    
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        error "Cannot connect to database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
        error "Please check database configuration and ensure it's running"
        exit 1
    fi
    
    success "Database connection verified"
}

# Main backup function
perform_backup() {
    local backup_file
    backup_file=$(generate_backup_filename)
    
    if create_backup "$backup_file"; then
        cleanup_old_backups
        return 0
    else
        return 1
    fi
}

# Show usage information
show_usage() {
    echo "Article Manager Database Backup Automation"
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  backup    Create a new database backup (default)"
    echo "  list      List existing backups"
    echo "  cleanup   Clean up old backups only"
    echo "  verify    Verify database connection"
    echo ""
    echo "Environment Variables:"
    echo "  BACKUP_DIR         Backup directory (default: ./backups)"
    echo "  RETENTION_DAYS     Days to keep backups (default: 30)"
    echo "  COMPRESS_BACKUPS   Compress backups with gzip (default: true)"
    echo "  BACKUP_PREFIX      Backup filename prefix (default: article-manager)"
    echo "  DB_HOST           Database host (default: localhost)"
    echo "  DB_PORT           Database port (default: 5432)"
    echo "  DB_NAME           Database name (default: article_manager)"
    echo "  DB_USER           Database user (default: article_user)"
    echo "  PGPASSWORD        Database password (required)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Create backup with default settings"
    echo "  $0 backup                    # Same as above"
    echo "  $0 list                      # List existing backups"
    echo "  RETENTION_DAYS=7 $0 cleanup  # Clean up backups older than 7 days"
}

# Main script logic
main() {
    local command="${1:-backup}"
    
    case "$command" in
        backup)
            check_dependencies
            setup_backup_directory
            verify_database_connection
            perform_backup
            list_backups
            ;;
        list)
            setup_backup_directory
            list_backups
            ;;
        cleanup)
            setup_backup_directory
            cleanup_old_backups
            ;;
        verify)
            verify_database_connection
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Handle script interruption
trap 'echo ""; error "Backup interrupted"; exit 1' INT TERM

# Check for required environment variables
if [[ -z "$PGPASSWORD" ]] && [[ -z "$DB_PASSWORD" ]]; then
    error "Database password not set. Please set PGPASSWORD or DB_PASSWORD environment variable"
    exit 1
fi

# Set PGPASSWORD if DB_PASSWORD is provided
if [[ -n "$DB_PASSWORD" ]] && [[ -z "$PGPASSWORD" ]]; then
    export PGPASSWORD="$DB_PASSWORD"
fi

# Run main function
main "$@"