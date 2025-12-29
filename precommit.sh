#!/bin/bash

# Precommit script - Runs build checks as GitHub workflow would on release
# This helps catch errors early before they reach CI/CD

set -e  # Exit on first error

echo "=================================="
echo "Running Precommit Checks"
echo "=================================="
echo ""

# Step 1: TypeScript Type Checking
echo "📝 Step 1: TypeScript Type Checking..."
bun run typecheck
echo "✅ TypeScript check passed"
echo ""

# Step 2: Build Frontend
echo "🏗️  Step 2: Building Frontend..."
bun run build
echo "✅ Frontend build passed"
echo ""

# Step 3: Verify build artifacts exist
echo "🔍 Step 3: Verifying build artifacts..."
if [ -d "public" ]; then
    BUILD_FILES=$(find public -name "App.*.js" | wc -l)
    if [ "$BUILD_FILES" -gt 0 ]; then
        echo "✅ Build artifacts verified (found $BUILD_FILES JS bundle(s))"
    else
        echo "❌ Error: No build artifacts found in public/"
        exit 1
    fi
else
    echo "❌ Error: public/ directory not found"
    exit 1
fi
echo ""

# Step 4: Build Docker image (optional - requires Docker)
echo "🐳 Step 4: Building Docker image..."
if command -v docker &> /dev/null; then
    docker build -t mcp-markdown-manager:precommit-test .
    echo "✅ Docker image build passed"
else
    echo "⚠️  Docker not found - skipping Docker build step"
    echo "   (This step will run in CI/CD environments)"
fi
echo ""

echo "=================================="
echo "✅ All Precommit Checks Passed!"
echo "=================================="
