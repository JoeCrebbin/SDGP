# Grant Vessels - Cutting Stock Optimisation Dashboard

A standalone Electron desktop application for optimising the use of steel beams in shipyard construction. Given a CSV of component cut lists, the system determines the optimal combination of raw beams to minimise material waste.

Built for the SDGP 2025-26 module (UFCF7S-30-2) at UWE Bristol.

## Features

- **CSV Import** with configurable column mapping and unit conversion (mm, cm, m)
- **Optimisation algorithm**: Best-Fit Decreasing (BFD) - minimises material waste
- **Visual cutting layout** showing colour-coded component segments on each beam, with waste highlighted
- **Waste comparison charts** (bar, pie, doughnut, per-nest) with PDF export
- **Batch history** with search, CSV download, and chart replay
- **User authentication** with admin approval workflow
- **Admin panel**: user management, system logs, global settings, all-batches view
- **High contrast mode** for accessibility
- **Offline-first** - no internet connection required

## Default Beam Sizes

Per the case study specification, raw beams are available in three sizes: **6000mm**, **8000mm**, and **13000mm**. These are read from the CSV data (`TotalLength` column) and fall back to these defaults if not specified.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Installation

```bash
git clone https://github.com/JoeCrebbin/SDGP.git
cd SDGP
npm install
```

The `postinstall` script automatically rebuilds native modules (better-sqlite3) for Electron.

### Running

```bash
npm start
```

## Default Accounts

| Email | Password | Role |
|---|---|---|
| admin@grantvessels.com | password | Admin |
| user@grantvessels.com | password | User |

New accounts registered through the app require admin approval before login.

## Project Structure

```
main.js                        Electron main process, IPC handlers
src/
  js/
    core/
      optimiser.js             BFD and FFD bin-packing algorithms
      optimiser_worker.js      Worker thread wrapper (non-blocking)
      preload.js               Context bridge (renderer <-> main)
    lib/
      chart.umd.min.js         Chart.js library (vendored)
    components/
      sidenav.js               Navigation, auth guard, contrast toggle
    pages/
      auth.js                  Login and register form handling
      dashboard.js             CSV upload, optimisation, charts, cutting layout
      history.js               Batch history with search
      settings.js              Password change, account deletion
    admin/
      users.js                 User management (approve/reject/delete)
      logs.js                  System activity logs
      settings.js              Global application settings
      batches.js               All-batches view with search
  html/                        All application pages
  css/styles.css               Theming, layout, cutting layout styles
  databases/db.js              SQLite schema, migrations, seed data
output/                        Generated CSV output files
```

## Tech Stack

- **Electron** - cross-platform desktop runtime
- **better-sqlite3** - embedded SQLite database
- **bcryptjs** - password hashing
- **Chart.js** - client-side charting
- **Worker Threads** - non-blocking optimisation
