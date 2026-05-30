#!/bin/bash

# Script per sincronizzare e caricare il progetto PoGODex sul Raspberry Pi tramite rsync.

# Configurazione destinazione (modificabile se necessario)
DEST_USER="nigel"
DEST_HOST="raspberrypi"
DEST_PATH="/home/nigel/PoGODex/"

echo -e "\033[0;34m================================================================\033[0m"
echo -e "\033[0;34m           Sincronizzazione PoGODex su Raspberry Pi             \033[0m"
echo -e "\033[0;34m================================================================\033[0m"
echo -e "Destinazione: \033[1;33m${DEST_USER}@${DEST_HOST}:${DEST_PATH}\033[0m"
echo "Compilazione del Frontend in corso localmente sul Mac..."
cd frontend && npm run build && cd ..

# Crea la directory di destinazione sul Raspberry Pi prima di avviare rsync
ssh "${DEST_USER}"@"${DEST_HOST}" "mkdir -p ${DEST_PATH}"

# Utilizzo di rsync per copiare i file escludendo node_modules, backend/dist/ e il DB
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
    echo -e "\033[0;32m================================================================\033[0m"
    echo -e "\033[0;32m                    DEPLOY SUCCESSFUL!                          \033[0m"
    echo -e "\033[0;32m================================================================\033[0m"
    echo -e "Connettiti al Raspberry Pi ed esegui i comandi:"
    echo -e "  \033[1;33mssh ${DEST_USER}@${DEST_HOST}\033[0m"
    echo -e "  \033[1;33mcd ${DEST_PATH}\033[0m"
    echo -e "  \033[1;33m./start-app.sh\033[0m"
else
    echo -e "\033[0;31m================================================================\033[0m"
    echo -e "\033[0;31m                      DEPLOY FAILED!                            \033[0m"
    echo -e "\033[0;31m================================================================\033[0m"
    echo "Controlla la connessione di rete ed assicurati che le chiavi SSH siano configurate."
fi
