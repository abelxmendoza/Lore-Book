#!/bin/bash

# Run All Tests Script
# This script runs all tests for both server and web apps

set -e

echo "========================================="
echo "Running All Tests"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Function to run tests
run_tests() {
    local dir=$1
    local name=$2
    
    echo -e "${YELLOW}Running ${name} tests...${NC}"
    cd "$dir"
    
    if npm test; then
        echo -e "${GREEN}✓ ${name} tests passed${NC}"
    else
        echo -e "${RED}✗ ${name} tests failed${NC}"
        FAILED=1
    fi
    
    echo ""
    cd - > /dev/null
}

# Run server tests
run_tests "apps/server" "Server"

# Run web tests
run_tests "apps/web" "Web"

# Summary
echo "========================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
