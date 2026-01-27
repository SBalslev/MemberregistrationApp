# Medlems Admin (Laptop App)

Master admin app for ISS Skydning membership management. This Electron and React app is the laptop hub for member data, device pairing, sync, equipment, finance, and reporting.

## Features

- Members management with trial member workflow and membership ID assignment
- Device pairing with 6-digit pairing codes
- Device rename and unpair controls
- Sync hub with periodic pull every 5 minutes and manual sync
- Equipment management and conflict resolution
- Finance module with exports
- SKV export to Excel
- Local database export and import for backup

## Requirements

- Node.js 18+
- npm

## Run in development

```bash
npm install
npm run dev
```

## Run Electron locally

```bash
npm run dev:electron
```

## Build

```bash
npm run build
```

## Windows installer

```bash
npm run build:win
```

## Pairing and sync

- Open Devices page on the laptop
- Start a pairing session to show a 6-digit code
- Enter the code on the tablet pairing screen
- Sync runs automatically every 5 minutes and can be triggered manually
- Rename the laptop in Settings and remove devices in Devices when needed

## Backup and restore

- Settings page supports database export and import
- Exports create a .db backup file
- Imports replace the local database

## SKV export

- Settings page includes SKV export to Excel
- Export uses a save dialog when running in Electron

## Tech stack

- React, TypeScript, Vite
- Electron main process with Express sync server
- SQLite via sql.js in the renderer
