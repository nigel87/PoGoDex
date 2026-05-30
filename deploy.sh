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
