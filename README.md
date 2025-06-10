![weave](weave.png?)

An interactive Terminal User Interface (TUI) for [Microsoft Fabric CLI](https://microsoft.github.io/fabric-cli/) built with [INK](https://github.com/vadimdemedes/ink).

## Prerequisites

- Python 3.10 or higher
- Node.js 16.0.0 or higher
- [Microsoft Fabric CLI (`fab`)](https://microsoft.github.io/fabric-cli/) installed and configured
- Authenticated Fabric session (having run `fab auth login` before using weave)

## Installation

### Option 1: Homebrew (Recommended)

Install directly from the custom tap:
```bash
brew tap marhaasa/tools
brew install weave
```

### Option 2: From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/marhaasa/weave.git
   cd weave
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running weave

![weave](https://github.com/user-attachments/assets/f9bbf903-869d-484d-b563-f80f17299bfc)

### Basic Usage

**If installed via Homebrew:**
```bash
weave
```

**If installed from source:**
```bash
npm start
# or for development
npm run dev
# or directly
./bin/weave
```

### Debug Mode

For troubleshooting, run with debug logging enabled:
```bash
WEAVE_DEBUG=1 weave
```
Debug logs are written to `/tmp/weave-debug.log`

## Features

### 🏢 Workspace Management
- **Interactive Workspace Browser**: Navigate through all your Microsoft Fabric workspaces
- **Dynamic Item Listing**: View and browse items within each workspace
- **Fresh Data**: No caching - always shows current workspace state

### 📊 Supported Item Types
- **📓 Notebooks** (`.Notebook`) - Jupyter notebooks for data analysis
- **🔄 Data Pipelines** (`.DataPipeline`) - ETL and data transformation workflows  
- **⚡ Spark Job Definitions** (`.SparkJobDefinition`) - Spark-based processing jobs

### 🚀 Job Execution
- **Background Jobs**: Start jobs asynchronously and monitor multiple concurrent executions
- **Synchronous Execution**: Run jobs with real-time status updates (up to 10 minutes)
- **Smart Monitoring**: Automatic job status polling and completion detection
- **Job History**: View details of previously executed jobs including timing and status

### 📁 Item Management
- **Move Items**: Transfer items between workspaces with `fab mv`
- **Copy Items**: Duplicate items across workspaces with `fab cp`
- **Cooldown Handling**: Graceful handling of Microsoft Fabric platform restrictions
- **Cross-Workspace Operations**: Select destination workspace from filtered list

### 🖥️ Terminal Interface
- **Responsive Design**: Adapts to terminal size with dynamic layouts
- **Keyboard Navigation**: Full keyboard control with intuitive shortcuts
- **Loading Animations**: Skeleton screens and progress indicators
- **Error Handling**: User-friendly error messages with actionable guidance

### 📝 Command History
- **Persistent History**: Track all executed commands with results
- **Success/Failure Tracking**: Visual indicators for command outcomes
- **Command Timing**: Duration tracking for performance monitoring
- **History Management**: Clear history or view detailed command logs

### 🔧 Developer Features
- **Interactive Shell**: Direct access to Microsoft Fabric CLI when needed
- **Debug Logging**: Comprehensive logging for troubleshooting
- **TypeScript**: Full type safety and modern development experience
- **Configurable**: Environment-based configuration and debugging

## Usage Guide

### Navigation Flow
1. **Main Menu** → Choose "Workspaces" to browse your Fabric workspaces
2. **Workspaces List** → Select a workspace to view its contents
3. **Workspace Items** → Choose an executable item (Notebook, Pipeline, or Spark Job)
4. **Item Actions** → Run jobs, view history, or move/copy items
5. **Job Monitoring** → Track execution status and view results

### Item Actions Available
For each executable item you can:
- **Run in Background**: Start job asynchronously and continue working
- **Run Synchronously**: Execute and wait for completion with real-time updates
- **View Job History**: Check details of the most recent job execution
- **Move to Another Workspace**: Transfer item using `fab mv`
- **Copy to Another Workspace**: Duplicate item using `fab cp`

### Job Status Monitoring
- **Real-time Updates**: Live status during synchronous execution
- **Background Tracking**: Monitor multiple concurrent background jobs
- **Detailed Reports**: Start time, end time, duration, and status information
- **Error Handling**: Clear error messages for failed executions

## Keyboard Shortcuts

- `↑/↓` - Navigate menus and lists
- `Enter` - Select option or execute action
- `q` or `ESC` - Go back to previous view or exit
- `r` - Refresh current list (workspaces or items)
- `c` - Clear command history (when viewing history)

## Technical Details

### Architecture
- **React + Ink**: Modern React components rendered to terminal
- **TypeScript**: Full type safety throughout the application
- **Debounced Operations**: Prevents excessive API calls while maintaining responsiveness
- **No Caching**: Always fetches fresh data for accurate workspace state
- **Smart Polling**: Efficient job status monitoring with adaptive intervals

### Microsoft Fabric CLI Integration
Weave executes the following Fabric CLI commands:
- `fab ls` - List workspaces
- `fab ls "workspace.Workspace"` - List workspace items  
- `fab job start` - Start background jobs
- `fab job run` - Run synchronous jobs
- `fab job run-status` - Get job status
- `fab job run-list` - Get job history
- `fab mv` - Move items between workspaces
- `fab cp` - Copy items between workspaces

### Error Handling
- **Platform Cooldowns**: Handles Microsoft Fabric's temporary restrictions on recently moved items
- **Network Issues**: Retry logic for transient failures
- **Authentication**: Guides users to re-authenticate when needed
- **Invalid Operations**: Clear feedback for unsupported actions

## Development

### Building
```bash
npm run build          # Compile TypeScript
npm run type-check     # Type checking only
npm run clean          # Remove build artifacts
```

### Development Mode
```bash
npm run dev            # Run with tsx
npm run dev:watch      # Run with file watching
```

### Project Structure
```
src/
├── app.tsx                 # Main application component
├── components/             # React components for each view
├── hooks/                  # Custom React hooks
├── services/               # Fabric CLI integration and utilities
├── types/                  # TypeScript type definitions
├── utils/                  # Helper functions and command builders
└── constants/              # Application constants and configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Test thoroughly including edge cases
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.