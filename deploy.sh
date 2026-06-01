#!/bin/bash

# ==============================================================================
# PoGODex - Optimized Remote Deployment Script
# ==============================================================================
# This script compiles the frontend application locally and synchronizes the
# lightweight source files to a remote deployment server (VPS, Home Server, etc.)
# using rsync.
# ==============================================================================

# ANSI styling colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables from .env file if it exists at root
ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
    # Parse out comments and blank lines, then export them
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Retrieve from environment or .env file (NO personal hardcoded defaults in Git!)
DEST_USER="${POGODEX_DEPLOY_USER}"
DEST_HOST="${POGODEX_DEPLOY_HOST}"
DEST_PATH="${POGODEX_DEPLOY_PATH}"
SSH_KEY_PATH="${POGODEX_DEPLOY_KEY:-}"

# Check for required variables
MISSING_VARS=()
if [ -z "$DEST_USER" ]; then MISSING_VARS+=("POGODEX_DEPLOY_USER"); fi
if [ -z "$DEST_HOST" ]; then MISSING_VARS+=("POGODEX_DEPLOY_HOST"); fi
if [ -z "$DEST_PATH" ]; then MISSING_VARS+=("POGODEX_DEPLOY_PATH"); fi

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo -e "${RED}❌ ERRORE: Mancano le seguenti variabili di configurazione obbligatorie per il deploy:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "  - ${YELLOW}$var${NC}"
    done
    echo -e "\nPuoi configurarle in due modi:"
    echo -e "  1. Crea un file ${GREEN}.env${NC} alla radice del progetto copiando ${GREEN}.env.example${NC} e inserendo i tuoi dati."
    echo -e "  2. Esporta le variabili direttamente nella tua shell prima di eseguire lo script (es: export POGODEX_DEPLOY_HOST=...)"
    echo -e "\nAbortisco il deploy."
    exit 1
fi

# Configure SSH target options (supports custom SSH keys)
SSH_KEY_ARG=""
RSYNC_SSH_ARG=""
if [ ! -z "$SSH_KEY_PATH" ]; then
    SSH_KEY_ARG="-i $SSH_KEY_PATH"
    RSYNC_SSH_ARG="-e \"ssh -i $SSH_KEY_PATH\""
    echo -e "${YELLOW}Using custom SSH key: $SSH_KEY_PATH${NC}"
fi

# Define SSH multiplex socket path (Connection Sharing)
SSH_SOCKET="/tmp/pogodex_ssh_mux_${DEST_HOST}_${DEST_USER}"

# Ensure cleanup of the master multiplex socket at script exit
cleanup_mux() {
    ssh -O exit -o ControlPath="$SSH_SOCKET" "${DEST_USER}"@"${DEST_HOST}" 2>/dev/null
}
trap cleanup_mux EXIT INT TERM

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

# 2. Ensure the remote destination directory exists & establish Master connection
echo -e "\n${YELLOW}[2/3] Preparing remote directory structure (Establishing Master SSH connection)...${NC}"
if ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=5m $SSH_KEY_ARG "${DEST_USER}"@"${DEST_HOST}" "mkdir -p ${DEST_PATH}"; then
    echo -e "${GREEN}✓ Remote directory created or verified.${NC}"
else
    echo -e "${RED}✗ Failed to connect or create remote directory. Verify SSH connection.${NC}"
    exit 1
fi

# 3. Synchronize files using rsync, reusing the Master SSH multiplex connection
echo -e "\n${YELLOW}[3/3] Synchronizing source files via rsync (Reusing SSH connection)...${NC}"
if [ ! -z "$RSYNC_SSH_ARG" ]; then
    rsync -avz --delete \
      -e "ssh -i $SSH_KEY_PATH -o ControlPath=$SSH_SOCKET" \
      --exclude 'node_modules/' \
      --exclude '.git/' \
      --exclude '.DS_Store' \
      --exclude 'backend/dist/' \
      --exclude 'backend/data/' \
      --exclude 'backend/backend.log' \
      --exclude 'frontend/frontend.log' \
      ./ "${DEST_USER}"@"${DEST_HOST}":"${DEST_PATH}"
else
    rsync -avz --delete \
      -e "ssh -o ControlPath=$SSH_SOCKET" \
      --exclude 'node_modules/' \
      --exclude '.git/' \
      --exclude '.DS_Store' \
      --exclude 'backend/dist/' \
      --exclude 'backend/data/' \
      --exclude 'backend/backend.log' \
      --exclude 'frontend/frontend.log' \
      ./ "${DEST_USER}"@"${DEST_HOST}":"${DEST_PATH}"
fi

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}================================================================${NC}"
    echo -e "${GREEN}                      DEPLOY SUCCESSFUL!                        ${NC}"
    echo -e "${GREEN}================================================================${NC}"
    echo -e "To launch your app, connect to the remote server and execute:"
    if [ ! -z "$SSH_KEY_PATH" ]; then
        echo -e "  ${YELLOW}ssh -i $SSH_KEY_PATH ${DEST_USER}@${DEST_HOST}${NC}"
    else
        echo -e "  ${YELLOW}ssh ${DEST_USER}@${DEST_HOST}${NC}"
    fi
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
