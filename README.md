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

| Email                  | Password | Role  |
| ---------------------- | -------- | ----- |
| admin@grantvessels.com | password | Admin |
| user@grantvessels.com  | password | User  |

New accounts registered through the app require admin approval before login.

## Quick Start Workflow

1. **Prepare CSV**  
   Ensure your component list has required columns and valid numeric values.

2. **Open Dashboard**  
   Launch the app and log in with your account.

3. **Upload & Inspect**  
   Select your CSV file and click **Inspect** to preview headers.

4. **Configure Mappings**  
   Map your CSV columns to **Component ID**, **Length**, and **Raw Beam Size**.

5. **Set Parameters**  
   Enter batch name, select units, and configure kerf (saw blade width) and minimum remnant.

6. **Run Optimisation**  
   Click **Run** to start the algorithm (runs in the background so the UI stays responsive).

7. **Review Results**  
   View summary stats, cutting layout, waste charts, and downloadable results.

8. **Save & Export**  
   Download output CSV and charts for reporting.

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

## Troubleshooting

| Issue                               | Solution                                                                |
| ----------------------------------- | ----------------------------------------------------------------------- |
| "No valid components found"         | Check CSV column mapping and row data for missing/invalid values.       |
| "Required length exceeds max stock" | Components larger than 13000mm cannot be cut; split into smaller parts. |
| Admin page blank after login        | Ensure your account is approved by an administrator.                    |
| UI becomes unresponsive during run  | Expected for large batches; optimization runs in background worker.     |

## Accessibility Features

- **High Contrast Mode**  
  Toggle for improved visibility; preference persists across sessions.

- **Keyboard Navigation**  
  All forms and controls accessible via keyboard for users who cannot use mouse input.

- **ARIA Labels**  
  Key interactive elements include accessibility labels for screen readers.

- **Offline Access**  
  Full functionality without internet connection; no third-party dependencies for core UI.

## Admin Guide

### User Management

- Review pending registrations in **Manage Users**
- Approve new accounts before they can log in
- Delete user accounts (cascades to delete associated data)

### Global Settings

- Configure default kerf width and minimum remnant for all users
- Changes apply to new dashboard sessions

### System Monitoring

- View activity logs for an audit trail of optimisations, logins, and deletions
- Search logs by action or user email

### Batch Administration

- View all batches across all users
- Search by batch name or date
- Download batch details and CSV outputs for reporting
