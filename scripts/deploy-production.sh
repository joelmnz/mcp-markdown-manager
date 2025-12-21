#!/bin/bash

# Production deployment script for Article Manager
# This script handles the complete deployment process including database setup

set -e  # Exit on any error

PORT="${PORT:-5000}"

echo "🚀 Starting Article Manager production deployment..."

# Check if required environment variables are set
check_env_vars() {
    local required_vars=("AUTH_TOKEN" "DB_PASSWORD")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        echo "❌ Missing required environment variables:"
        printf '   - %s\n' "${missing_vars[@]}"
        echo "Please set these variables and try again."
        exit 1
    fi
}

# Build the application
build_application() {
    echo "📦 Building application..."
    bun install --frozen-lockfile
    bun run build
    echo "✅ Application built successfully"
}

# Start database and wait for it to be ready
start_database() {
    echo "🗄️  Starting PostgreSQL database..."
    docker-compose up -d postgres
    
    echo "⏳ Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker-compose exec -T postgres pg_isready -U article_user -d article_manager >/dev/null 2>&1; then
            echo "✅ Database is ready"
            return 0
        fi
        
        echo "   Attempt $attempt/$max_attempts - waiting for database..."
        sleep 2
        ((attempt++))
    done
    
    echo "❌ Database failed to start within expected time"
    docker-compose logs postgres
    exit 1
}

# Initialize database schema
initialize_database() {
    echo "🔧 Initializing database schema..."
    
    # Run database initialization
    if bun run db:init; then
        echo "✅ Database schema initialized"
    else
        echo "❌ Database initialization failed"
        exit 1
    fi
    
    # Verify database health
    echo "🔍 Verifying database health..."
    if bun run db:health; then
        echo "✅ Database health check passed"
    else
        echo "❌ Database health check failed"
        exit 1
    fi
}

# Start the full application
start_application() {
    echo "🚀 Starting full application..."
    docker-compose up -d
    
    echo "⏳ Waiting for application to be ready..."
    local max_attempts=20
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f http://localhost:${PORT}/health >/dev/null 2>&1; then
            echo "✅ Application is ready and healthy"
            return 0
        fi
        
        echo "   Attempt $attempt/$max_attempts - waiting for application..."
        sleep 3
        ((attempt++))
    done
    
    echo "❌ Application failed to start within expected time"
    docker-compose logs article-manager
    exit 1
}

# Create backup directory
setup_backup_directory() {
    echo "📁 Setting up backup directory..."
    mkdir -p ./backups
    chmod 755 ./backups
    echo "✅ Backup directory ready"
}

# Display deployment summary
show_deployment_summary() {
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "📊 Application Status:"
    echo "   - Web UI: http://localhost:${PORT}"
    echo "   - Health Check: http://localhost:${PORT}/health"
    echo "   - Database: PostgreSQL on localhost:5432"
    echo ""
    echo "🔧 Management Commands:"
    echo "   - View logs: docker-compose logs -f"
    echo "   - Stop: docker-compose down"
    echo "   - Manual backup: bun run db:backup"
    echo "   - Automated backup: bun run db:backup:auto"
    echo "   - List backups: bun run db:backup:list"
    echo "   - Health check: bun run db:health"
    echo ""
    echo "📚 Next Steps:"
    echo "   1. Test the application at http://localhost:${PORT}"
    echo "   2. Import existing data: bun run import import ./data"
    echo "   3. Set up regular backups"
    echo "   4. Configure monitoring and alerts"
}

# Main deployment process
main() {
    echo "Article Manager Production Deployment"
    echo "====================================="
    
    check_env_vars
    build_application
    setup_backup_directory
    start_database
    initialize_database
    start_application
    show_deployment_summary
}

# Handle script interruption
trap 'echo "❌ Deployment interrupted"; docker-compose down; exit 1' INT TERM

# Run main function
main "$@"