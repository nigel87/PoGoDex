# 🌐 Guida d'Installazione & Deployment di PoGODex su Raspberry Pi

**PoGODex** è un'applicazione web moderna e ad alta fedeltà visiva (stile *glassmorphic premium*) progettata per tracciare la tua collezione personale di Pokémon GO (Shiny, 100% IV, Ombra, Purificati, Mega, Gigamax e taglie XXL/XXS). 

Grazie alla migrazione da Java Spring Boot a **Node.js + TypeScript + SQLite**, l'applicazione è incredibilmente leggera e reattiva, consumando meno di **30-50MB di memoria RAM** totale, rendendola perfetta per girare in modo permanente su **Raspberry Pi (Zero 2 W, 3, 4, o 5)**!

---

## 🛠️ 1. Requisiti & Installazione Pulita sul Raspberry Pi

Connettiti al terminale del tuo Raspberry Pi tramite SSH ed esegui i comandi indicati di seguito per predisporre un ambiente pulito.

### A. Aggiornare il Sistema Operativo
```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### B. Installare SQLite e Strumenti di Rete
Installa SQLite3, le librerie di sviluppo nativo (necessarie per compilare i driver database se mancano i prebuilt binaries) e rsync:
```bash
sudo apt-get install -y sqlite3 libsqlite3-dev build-essential git rsync
```

### C. Installare Node.js (Versione 20+ LTS Consigliata)
Non utilizzare la versione predefinita dei repository apt standard (che potrebbe essere molto vecchia). Installa Node.js LTS tramite il repository ufficiale NodeSource:
```bash
# Scarica e configura il setup per Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Installa Node.js e npm
sudo apt-get install -y nodejs
```

Verifica che l'installazione sia andata a buon fine controllando le versioni:
```bash
node -v  # Dovrebbe mostrare v20.x.x o superiore
npm -v   # Dovrebbe mostrare v10.x.x o superiore
```

---

## 🚀 2. Deploy locale tramite lo Script `deploy.sh`

Sul tuo computer di sviluppo locale (Mac o Linux), all'interno della cartella principale del progetto PoGODex, è presente lo script di deploy asincrono ed ottimizzato [deploy.sh](deploy.sh).

Questo script utilizza `rsync` per trasferire solo i file sorgenti utili sul Raspberry Pi in pochi secondi, **escludendo automaticamente** le cartelle pesanti (`node_modules`), i compilati locali (`dist`) ed il database di sviluppo (`backend/data/pogodex.sqlite`) per evitare sovrascritture accidentali sul server di produzione.

### Configurazione dello script:
Apri [deploy.sh](deploy.sh) e modifica le variabili in alto se il nome utente o l'host del tuo Raspberry Pi sono diversi:
```bash
DEST_USER="nigel"
DEST_HOST="raspberrypi"
DEST_PATH="/home/nigel/PoGODex/"
```

### Esecuzione del Deploy:
Rendi eseguibile lo script ed avvialo:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## ⚡ 3. Avvio dell'Applicazione sul Raspberry Pi

Una volta completato il deploy, connettiti in SSH sul Raspberry Pi per avviare il servizio:

```bash
ssh nigel@raspberrypi
cd /home/nigel/PoGODex
```

### Avvio Automatico Reattivo:
Esegui lo script principale di orchestrazione [start-app.sh](start-app.sh):
```bash
chmod +x start-app.sh
./start-app.sh
```
Questo script eseguirà in modo asincrono:
1. Verifica e liberazione automatica delle porte `8085` (Backend) e `4205` (Frontend) se occupate.
2. Installazione automatica di tutte le dipendenze npm per il backend e per il frontend.
3. Migrazione ed inizializzazione del database SQLite persistente.
4. Popolamento dei 989 Pokémon delle 9 generazioni e varianti regionali.
5. Avvio del server Express in background e del client Angular (configurato per ascoltare sull'host `0.0.0.0`, rendendolo accessibile a tutti i dispositivi della tua rete locale).

---

## 📱 4. Accesso nella Rete Locale (LAN)

Una volta avviata l'applicazione sul Raspberry Pi, puoi accedervi da **qualsiasi dispositivo connesso allo stesso Wi-Fi** (iPhone, iPad, Computer portatili, Smart TV) inserendo semplicemente nel browser l'indirizzo IP locale del Raspberry Pi o il suo hostname locale:

* 🌐 **Interfaccia Web Pokédex**: `http://<IP-DEL-RASPBERRY-PI>:4205`
* 🔌 **Console Database & API REST**: `http://<IP-DEL-RASPBERRY-PI>:8085`

*Grazie alla nostra speciale architettura di rete adattiva, il client Angular rileva dinamicamente il nome host del browser ed instrada tutte le chiamate REST direttamente all'indirizzo corretto del Raspberry Pi, garantendo una navigazione remota fluida ed immediata senza alcun tipo di configurazione IP manuale hardcoded!*

---

## 🛡️ 5. Mantenere l'App sempre attiva con PM2 (Opzionale e Consigliato)

Se vuoi che PoGODex rimanga attivo in background anche se chiudi la sessione SSH o se il Raspberry Pi viene riavviato (ad esempio dopo un'interruzione di corrente), è consigliabile utilizzare **PM2**, il gestore di processi standard per Node.js.

### A. Installare PM2 globalmente
```bash
sudo npm install -g pm2
```

### B. Avviare i servizi sotto PM2
Dalla cartella principale del progetto `/home/nigel/PoGODex`:
```bash
# Avvia il Backend Node.js
cd backend
pm2 start dist/index.js --name "pogodex-backend"

# Avvia il Frontend Angular
cd ../frontend
pm2 start "npx ng serve --host 0.0.0.0 --port 4205" --name "pogodex-frontend"
```

### C. Salvare lo Stato ed Abilitare l'Avvio al Boot del Raspberry Pi
```bash
# Salva l'elenco dei processi attivi
pm2 save

# Genera lo script di startup per systemd (copia ed incolla il comando generato a schermo)
pm2 startup
```
Da questo momento in poi, PoGODex si avvierà in modo completamente invisibile e silenzioso all'accensione del tuo Raspberry Pi!
