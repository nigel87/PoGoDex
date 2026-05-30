# 🌐 PoGODex - Ultimate Pokémon GO Collection Tracker

**PoGODex** is a modern, high-fidelity web application styled with a premium *glassmorphic dark UI* designed to catalog, organize, and track your personal Pokémon GO collections. 

Track your **Shiny**, **100% IV (Perfect)**, **Shadow**, **Purified**, **Mega Evolutions**, **Gigamax Forms**, and **XXL/XXS** size collections all in one clean, fluid interface.

Thanks to its lightweight migration from Java Spring Boot to **Node.js + TypeScript + SQLite**, the application compiles in seconds and runs with a microscopic footprint (**<15MB RAM** for the backend), making it ideal for hosting on any device—from standard laptops (macOS, Windows, Linux) to lightweight single-board computers (like Raspberry Pi) or VPS instances!

---

## ✨ Key Features

*   🌍 **Full Pokédex (989 Species)**: Pre-loaded offline database containing all released Pokémon from Generations 1 to 9, including all geographic Regional Forms (Alolan, Galarian, Hisuian, Paldean).
*   🎭 **Regional Form Swapper**: Dynamic, layout-optimized regional variant selector inside Pokémon cards. Automatically filters regional forms by type and geographic region.
*   👑 **100% Completion Celebrations**: Modern, soft pulsing neon animations and golden crown `👑` achievements for completely captured species.
*   👥 **Netflix-Style Multi-User Profiles**: Switch between multiple player profiles on-the-fly via a glassmorphic header dropdown. Create new profiles instantly with zero authentication required.
*   📊 **Visual Stat Dashboards**: Interactive, responsive pure CSS donut charts showing capture percentages for all 8 categories—filtered globally or by individual geographic region.
*   📋 **GO Search String Generator**: Instantly generate standard Pokémon GO search strings (e.g. `!1&!4&!7` or `1,4,7`) for missing species in each category to copy and paste directly into the game.
*   🛡️ **Single-Port Production Deployment**: Express acts as a static web server to serve Angular directly on port `8085`. This eliminates Cross-Origin Resource Sharing (CORS) blocks and Mixed Content (HTTP/HTTPS) issues.
*   ☁️ **Cloudflare Tunnel Ready**: Pre-configured support for custom domains (e.g., `pogodex.xyz`) via Cloudflare Tunnels with safe `allowedHosts` settings.

---

## 🛠️ Tech Stack

*   **Frontend**: Angular 18 (Standalone Components, reactive Signals state management, vanilla CSS).
*   **Backend**: Node.js + Express + TypeScript.
*   **Database**: SQLite3 via lightweight async database bindings (`sqlite` & `sqlite3` packages).
*   **Asset Pipeline**: Dynamic 3D artworks and high-definition shiny assets loaded dynamically from PokeAPI official repositories.

---

## 🚀 Getting Started & Installation

PoGODex is equipped with a self-healing setup script that automatically checks network ports, installs npm dependencies, migrates the database, and launches the servers.

### Prerequisites
Make sure you have [Node.js (v20+ LTS recommended)](https://nodejs.org/) and `git` installed on your machine.

### Quick Start (All Platforms)

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/nigel87/PoGoDex.git
    cd PoGoDex
    ```

2.  **Launch the Application**:
    Run the orchestration script:
    *   **macOS / Linux**:
        ```bash
        chmod +x start-app.sh
        ./start-app.sh
        ```
    *   **Windows (Git Bash / WSL)**:
        ```bash
        ./start-app.sh
        ```

3.  **Explore your Pokédex!**
    Open your browser and navigate to:
    👉 **`http://localhost:4205`** or the backend server at **`http://localhost:8085`** (serving the Angular app statically).

---

## ⚡ Deployment & Hosting

### Option A: Hosting via Backend Static Server (Recommended)
This is the most lightweight method (consuming only **~15MB RAM**).
1.  Compile the Angular frontend locally:
    ```bash
    cd frontend && npm install && npm run build && cd ..
    ```
2.  Install dependencies and start the Express backend:
    ```bash
    cd backend && npm install && npm run build && npm run start
    ```
3.  Access the app directly on: **`http://localhost:8085`**.

### Option B: Remote Server / VPS Sync via `deploy.sh`
If you develop on a local machine (Mac/PC) and want to deploy to a remote server (like a Raspberry Pi or a VPS in your home network):
1.  Open the [deploy.sh](deploy.sh) script and customize your connection details:
    ```bash
    DEST_USER="your-username"
    DEST_HOST="your-server-ip-or-host"
    DEST_PATH="/home/username/PoGODex/"
    ```
2.  Run the deploy script from your development machine:
    ```bash
    chmod +x deploy.sh
    ./deploy.sh
    ```
    This script will compile Angular locally on your fast machine (taking less than 2 seconds), then utilize `rsync` to transfer the ready-to-serve files to the remote server, bypassing compilation overhead on slow devices!

---

## 🛡️ Production PM2 Keeping-Alive (Optional)

To keep PoGODex running persistently in the background on your home server (surviving reboots and crashes), we recommend using **PM2**:

1.  **Install PM2 Globally**:
    ```bash
    sudo npm install -g pm2
    ```

2.  **Start the Service**:
    From the root project directory:
    ```bash
    cd backend
    pm2 start dist/index.js --name "pogodex-backend"
    ```

3.  **Enable System Startup**:
    Save the PM2 process list and configure systemd to launch it on boot:
    ```bash
    pm2 save
    pm2 startup
    ```

---

## 🌐 Custom Domain & Cloudflare Tunnels

If you own a custom domain (e.g. `yourpogodex.com`) and want to expose PoGODex to the internet securely via HTTPS without opening any ports on your router, configure a Cloudflare Tunnel pointing to:

*   **Service Type**: `HTTP`
*   **URL**: `http://localhost:8085` (pointing to the static Express port).

The frontend detects custom domain headers dynamically and switches seamlessly to secure relative routes, preventing all CORS blocks and browser Mixed Content warnings automatically!

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
