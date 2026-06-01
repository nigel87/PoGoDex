#!/bin/bash

# ==============================================================================
# PoGODex - Optimized Remote Deployment Script
# ==============================================================================
# This script compiles the frontend application locally and synchronizes the
# lightweight source files to a remote deployment server (VPS, Home Server, etc.)
# using rsync.
# ==============================================================================

# Destination server configuration (Adjust these variables as needed)
DEST_USER="nigel"
DEST_HOST="raspberrypi"
DEST_PATH="/home/nigel/PoGODex/"

# ANSI styling colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}             PoGODex Remote Project Synchronization             ${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "Target Server: ${YELLOW}${DEST_USER}@${DEST_HOST}:${DEST_PATH}${NC}"

# ==============================================================================
# Centralized Version Management System (Auto-Increment)
# ==============================================================================
VERSION_FILE="version.json"
if [ -f "$VERSION_FILE" ]; then
    CURRENT_VERSION=$(grep -o '"version": "[^"]*' "$VERSION_FILE" | cut -d'"' -f4)
else
    CURRENT_VERSION="1.4.1"
    echo -e "{" > "$VERSION_FILE"
    echo -e "  \"version\": \"$CURRENT_VERSION\"" >> "$VERSION_FILE"
    echo -e "}" >> "$VERSION_FILE"
fi

echo -e "\n${BLUE}================================================================${NC}"
echo -e "${YELLOW}               APPLICATION VERSION MANAGEMENT                   ${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "Current App Version: ${GREEN}v$CURRENT_VERSION${NC}"
read -p "Do you want to increment the version number for this deploy? [y/N]: " increment_choice

if [[ "$increment_choice" =~ ^[Yy]$ ]]; then
    # Parse version parts
    IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
    patch_inc=$((patch + 1))
    minor_inc=$((minor + 1))
    major_inc=$((major + 1))
    
    echo -e "\nSelect version increment type:"
    echo -e "  1) Patch Release (${GREEN}v$CURRENT_VERSION${NC} -> ${GREEN}v$major.$minor.$patch_inc${NC})"
    echo -e "  2) Minor Feature (${GREEN}v$CURRENT_VERSION${NC} -> ${GREEN}v$major.$minor_inc.0${NC})"
    echo -e "  3) Major Version (${GREEN}v$CURRENT_VERSION${NC} -> ${GREEN}v$major_inc.0.0${NC})"
    read -p "Choice [1]: " choice
    choice=${choice:-1}
    
    if [ "$choice" -eq 1 ]; then
        NEW_VERSION="$major.$minor.$patch_inc"
    elif [ "$choice" -eq 2 ]; then
        NEW_VERSION="$major.$minor_inc.0"
    elif [ "$choice" -eq 3 ]; then
        NEW_VERSION="$major_inc.0.0"
    else
        NEW_VERSION="$CURRENT_VERSION"
    fi
    
    echo -e "${GREEN}✓ Incrementing version to v$NEW_VERSION...${NC}"
else
    NEW_VERSION="$CURRENT_VERSION"
    echo -e "${YELLOW}✓ Keeping current version v$NEW_VERSION.${NC}"
fi

# 1. Update version.json at the root
echo "{" > "$VERSION_FILE"
echo "  \"version\": \"$NEW_VERSION\"" >> "$VERSION_FILE"
echo "}" >> "$VERSION_FILE"

# 2. Update generated version.ts in the frontend
echo "export const APP_VERSION = '$NEW_VERSION';" > frontend/src/app/version.ts

# 3. Synchronize versions in frontend and backend package.json files
node -e "
const fs = require('fs');
['frontend/package.json', 'backend/package.json'].forEach(file => {
  if (fs.existsSync(file)) {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  }
});
"
echo -e "${GREEN}✓ Centralized version v$NEW_VERSION synchronized successfully across all files!${NC}"

# 1. Compile the Angular Frontend locally to save CPU/RAM on the remote server
echo -e "\n${YELLOW}[1/3] Compiling Angular Frontend locally on Mac/PC...${NC}"
cd frontend
if npm run build; then
    echo -e "${GREEN}✓ Frontend compiled successfully!${NC}"
else
    echo -e "${RED}✗ Frontend compilation failed. Aborting deployment.${NC}"
    exit 1
fi
cd ..

# 2. Ensure the remote destination directory exists
echo -e "\n${YELLOW}[2/3] Preparing remote directory structure...${NC}"
if ssh "${DEST_USER}"@"${DEST_HOST}" "mkdir -p ${DEST_PATH}"; then
    echo -e "${GREEN}✓ Remote directory created or verified.${NC}"
else
    echo -e "${RED}✗ Failed to connect or create remote directory. Verify SSH connection.${NC}"
    exit 1
fi

# 3. Synchronize files using rsync, excluding node_modules, logs, and database
echo -e "\n${YELLOW}[3/3] Synchronizing source files via rsync...${NC}"
rsync -avz --delete \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'backend/dist/' \
  --exclude 'backend/data/' \
  --exclude 'backend/backend.log' \
  --exclude 'frontend/frontend.log' \
  ./ "${DEST_USER}"@"${DEST_HOST}":"${DEST_PATH}"

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}================================================================${NC}"
    echo -e "${GREEN}                      DEPLOY SUCCESSFUL!                        ${NC}"
    echo -e "${GREEN}================================================================${NC}"
    echo -e "To launch your app, connect to the remote server and execute:"
    echo -e "  ${YELLOW}ssh ${DEST_USER}@${DEST_HOST}${NC}"
    echo -e "  ${YELLOW}cd ${DEST_PATH}${NC}"
    echo -e "  ${YELLOW}./start-app.sh${NC}"
    echo -e "${GREEN}================================================================${NC}"
else
    echo -e "\n${RED}================================================================${NC}"
    echo -e "${RED}                        DEPLOY FAILED!                          ${NC}"
    echo -e "${RED}================================================================${NC}"
    echo -e "Please check your network connection, server status, and SSH keys."
    echo -e "${RED}================================================================${NC}"
    exit 1
fi
