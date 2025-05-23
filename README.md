# weave

An interactive Terminal User Interface (TUI) for Microsoft Fabric CLI built with React and Ink.

## Prerequisites

- Node.js 16.0.0 or higher
- Microsoft Fabric CLI (`fab`) installed and configured
- Authenticated Fabric session

## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd weave
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the TUI

Start the application using npm:
```bash
npm start
```

Or run directly with Node.js:
```bash
node weave.js
```

## Features

- **Interactive Workspace Browser**: Navigate through your Fabric workspaces
- **Notebook Management**: Run notebooks asynchronously or synchronously
- **Job Monitoring**: Track job status and completion
- **Command History**: View previously executed commands
- **Interactive Shell**: Access the native Fabric CLI when needed

## Usage

1. **Main Menu**: Use arrow keys to navigate, Enter to select
2. **Workspaces**: Browse and select from available workspaces
3. **Notebook Actions**: 
   - Run notebooks in background
   - Run synchronously with real-time status
   - View job details and history
4. **Navigation**: Use 'q' or ESC to go back, 'r' to refresh lists

## Keyboard Shortcuts

- `↑/↓` - Navigate menus
- `Enter` - Select option
- `q` or `ESC` - Go back/Exit
- `r` - Refresh (where applicable)
- `c` - Clear command history (in history view)

## Requirements

Make sure you have the Microsoft Fabric CLI installed and properly authenticated before using this TUI.
