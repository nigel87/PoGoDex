#!/bin/bash

# Script per avviare contemporaneamente il Backend (Node.js Express) e il Frontend (Angular)
# per l'applicazione PoGODex.

# Colori per i log
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}                    Avvio di PoGODex App                        ${NC}"
echo -e "${BLUE}================================================================${NC}"

# Funzione per terminare tutti i processi di background alla chiusura dello script
cleanup() {
    echo -e "\n${YELLOW}Chiusura dei server in corso...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}Chiusura completata con successo! Ciao!${NC}"
    exit
}

# Assicura che la funzione cleanup venga eseguita su CTRL+C (SIGINT) o chiusura (SIGTERM)
trap cleanup SIGINT SIGTERM

# Centralized Version Management System (Auto-Generator)
VERSION_FILE="version.json"
if [ ! -f "$VERSION_FILE" ]; then
    echo "{" > "$VERSION_FILE"
    echo "  \"version\": \"1.4.1\"" >> "$VERSION_FILE"
    echo "}" >> "$VERSION_FILE"
fi
CURRENT_VERSION=$(grep -o '"version": "[^"]*' "$VERSION_FILE" | cut -d'"' -f4)
if [ ! -f "frontend/src/app/version.ts" ]; then
    echo "export const APP_VERSION = '$CURRENT_VERSION';" > frontend/src/app/version.ts
fi

# 1. Verifica disponibilità delle porte (solo processi in ascolto locale LISTEN)
echo -e "${YELLOW}Verifica disponibilità delle porte...${NC}"
PORT_8085=$(lsof -t -i:8085 -sTCP:LISTEN)
if [ ! -z "$PORT_8085" ]; then
    echo -e "${RED}Errore: La porta 8085 è già in uso dal processo PID $PORT_8085.${NC}"
    echo -e "${YELLOW}Vuoi terminare il processo esistente? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        kill -9 $PORT_8085
        echo -e "${GREEN}Processo terminato.${NC}"
    else
        echo -e "${RED}Impossibile avviare il backend. Esco.${NC}"
        exit 1
    fi
fi

PORT_4205=$(lsof -t -i:4205 -sTCP:LISTEN)
if [ ! -z "$PORT_4205" ]; then
    echo -e "${RED}Errore: La porta 4205 è già in uso dal processo PID $PORT_4205.${NC}"
    echo -e "${YELLOW}Vuoi terminare il processo esistente? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        kill -9 $PORT_4205
        echo -e "${GREEN}Processo terminato.${NC}"
    else
        echo -e "${RED}Impossibile avviare il frontend. Esco.${NC}"
        exit 1
    fi
fi

# 2. Avvio del Backend Node.js + SQLite
echo -e "${YELLOW}Configurazione e Avvio del Backend (Node.js + Express + SQLite)...${NC}"
cd backend
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}node_modules non trovato in backend. Installazione delle dipendenze in corso (potrebbe richiedere qualche minuto)...${NC}"
    npm install
fi
echo -e "${YELLOW}Compilazione dei sorgenti TypeScript...${NC}"
npm run build
npm run start > backend.log 2>&1 &
BACKEND_PID=$!
cd ..
 
# 3. Avvio del Frontend Angular
ANGULAR_VERSION=$(grep -o '"@angular/core": "[^"]*' frontend/package.json 2>/dev/null | cut -d'"' -f4 | tr -d '^~' | cut -d'.' -f1)
if [ -z "$ANGULAR_VERSION" ]; then
    ANGULAR_VERSION="21"
fi
echo -e "${YELLOW}Configurazione e Avvio del Frontend (Angular $ANGULAR_VERSION)...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}node_modules non trovato in frontend. Installazione delle dipendenze in corso (potrebbe richiedere qualche minuto)...${NC}"
    npm install
fi
npm run start > frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
 
echo -e "${GREEN}Applicazione avviata correttamente in background!${NC}"
echo -e "Monitoraggio dell'avvio nei file di log..."
 
# Ciclo di controllo dell'avvio dei server
backend_ready=false
frontend_ready=false
 
for i in {1..30}; do
    if [ "$backend_ready" = false ]; then
        if grep -q "Server REST in ascolto" backend/backend.log 2>/dev/null; then
            echo -e "${GREEN}[Backend OK]${NC} Server REST avviato con successo!"
            backend_ready=true
        fi
    fi
 
    if [ "$frontend_ready" = false ]; then
        if grep -q "Local:" frontend/frontend.log 2>/dev/null || grep -q "http://localhost:4205" frontend/frontend.log 2>/dev/null; then
            echo -e "${GREEN}[Frontend OK]${NC} Server di sviluppo Angular avviato con successo!"
            frontend_ready=true
        fi
    fi
 
    if [ "$backend_ready" = true ] && [ "$frontend_ready" = true ]; then
        break
    fi
    sleep 2
done
 
echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}           L'APPLICAZIONE È PRONTA PER L'USO!${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "👉 Visita il Pokedex nel browser all'indirizzo: ${GREEN}http://localhost:4205${NC}"
echo -e "👉 Database SQLite persistente attivo in:       ${YELLOW}backend/data/pogodex.sqlite${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "${YELLOW}Premi CTRL+C per spegnere entrambi i server contemporaneamente.${NC}"

# Resta in attesa tenendo il processo principale attivo per catturare il segnale di chiusura
while true; do
    sleep 1
done
