import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Constants and Configuration
const VIEWS = {
  MAIN: 'main',
  WORKSPACES: 'workspaces',
  WORKSPACE_ITEMS: 'workspace-items',
  NOTEBOOK_ACTIONS: 'notebook-actions',
  OUTPUT: 'output',
  COMMAND_HISTORY: 'command-history',
  JOB_MENU: 'job-menu',
  JOB_STATUS: 'job-status'
};

const COMMANDS = {
  LIST_WORKSPACES: 'fab ls',
  HELP: 'fab --help',
  LIST_WORKSPACE: (workspace) => `fab ls "${workspace}.Workspace"`,
  JOB_START: (workspace, notebook) => `fab job start ${workspace}.Workspace/${notebook}`,
  JOB_RUN_SYNC: (workspace, notebook) => `fab job run /${workspace}.Workspace/${notebook}`,
  JOB_STATUS: (workspace, notebook, jobId) => `fab job run-status /${workspace}.Workspace/${notebook} --id ${jobId}`,
  JOB_LIST: (workspace, notebook) => `fab job run-list /${workspace}.Workspace/${notebook}`
};

const COLORS = {
  PRIMARY: 'cyan',
  SUCCESS: 'green',
  WARNING: 'yellow',
  ERROR: 'red',
  SECONDARY: 'gray',
  HIGHLIGHT_BG: 'cyan',
  SUCCESS_BG: 'green',
  WARNING_BG: 'yellow'
};

const MENU_OPTIONS = [
  { label: 'Workspaces', command: COMMANDS.LIST_WORKSPACES, view: VIEWS.WORKSPACES },
  { label: 'Manual Interactive Shell', action: 'interactive' },
  { label: 'Command History', action: 'history', view: VIEWS.COMMAND_HISTORY },
  { label: 'Exit', action: 'exit' }
];

// Configuration management
const CONFIG_DIR = path.join(os.homedir(), '.fabric-tui');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');

const loadConfig = async () => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { cacheTimeout: 300000, maxRetries: 2, theme: 'default' };
  }
};

const saveConfig = async (config) => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
};

// Utility Functions
const utils = {
  cleanOutput: (output) => output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n/g, '\n')
    .trim(),

  parseWorkspaces: (output) => output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('Listing') && !line.startsWith('ID') && !line.startsWith('─'))
    .map(line => {
      let workspaceName = line;
      if (line.includes('.')) {
        workspaceName = line.split('.')[0];
      }
      return workspaceName.trim();
    })
    .filter(name => name && name.length > 0),

  parseWorkspaceItems: (output) => output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('Listing') && !line.startsWith('ID') && !line.startsWith('─'))
    .map(line => line.trim())
    .filter(item => item && item.length > 0),

  formatJobId: (output) => {
    // Match pattern: Job instance 'xxxxx-xxxx-xxxx-xxxx-xxxx' created
    const match = output.match(/Job instance '([a-f0-9-]+)' created/i);
    return match ? match[1] : null;
  },

  parseJobStatus: (output) => {
    // Parse the table output from job run-status command
    const lines = output.split('\n');
    let statusInfo = {
      status: 'Unknown',
      startTime: null,
      endTime: null,
      jobType: null
    };

    // Look for the data line
    for (const line of lines) {
      // Skip empty lines, borders, and headers
      if (!line.trim() || line.includes('──────') || line.includes('id') || line.includes('itemId')) continue;

      // Check if line contains a GUID (indicates data row)
      if (line.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)) {
        // Remove table borders if present
        const cleanLine = line.replace(/^\s*│\s*/, '').replace(/\s*│\s*$/, '').trim();

        // Try different parsing strategies

        // Strategy 1: Look for specific patterns
        // Extract status - look for status keywords
        const statusMatch = cleanLine.match(/\b(InProgress|Completed|Failed|NotStarted|Succeeded)\b/i);
        if (statusMatch) {
          statusInfo.status = statusMatch[1];
        }

        // Extract job type
        const jobTypeMatch = cleanLine.match(/\b(RunNotebook|RunPipeline)\b/i);
        if (jobTypeMatch) {
          statusInfo.jobType = jobTypeMatch[1];
        }

        // Extract timestamps - look for all timestamp patterns
        const timestamps = cleanLine.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g);
        if (timestamps && timestamps.length > 0) {
          statusInfo.startTime = timestamps[0];

          // If there's more than one timestamp, the last one is usually the end time
          if (timestamps.length > 1) {
            // Don't use endTime if it's "None" or if it's identical to startTime
            const potentialEndTime = timestamps[timestamps.length - 1];
            if (potentialEndTime !== statusInfo.startTime && !cleanLine.includes("None")) {
              statusInfo.endTime = potentialEndTime;
            }
          }
        }

        // Strategy 2: Try splitting by pipes and/or multiple spaces
        // Always run Strategy 2 to ensure we catch end times even if Strategy 1 found status/start time
        if (!statusInfo.status || statusInfo.status === 'Unknown' || !statusInfo.startTime || !statusInfo.endTime) {
          // Try splitting by table separators if present
          let fields;
          if (line.includes('|')) {
            fields = line.split('|').map(f => f.trim()).filter(f => f.length > 0);
          } else {
            fields = cleanLine.split(/\s{2,}/).filter(f => f.trim().length > 0);
          }

          // Look through fields for status keywords
          for (let i = 0; i < fields.length; i++) {
            const field = fields[i].trim();

            // Check for status
            if (['InProgress', 'Completed', 'Failed', 'NotStarted', 'Succeeded'].some(s =>
              field.toLowerCase().includes(s.toLowerCase()))) {
              const statusMatch = field.match(/\b(InProgress|Completed|Failed|NotStarted|Succeeded)\b/i);
              if (statusMatch) {
                statusInfo.status = statusMatch[1];
              }
            }

            // Check for timestamps
            if (field.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
              if (!statusInfo.startTime) {
                statusInfo.startTime = field;
              } else if (field !== 'None' && field !== statusInfo.startTime) {
                statusInfo.endTime = field;
              }
            }
          }
        }

        break; // Found our data line, stop searching
      }
    }

    // Ensure that the end time isn't set if it's "None" or identical to start time
    if (statusInfo.endTime && (statusInfo.endTime === 'None' || statusInfo.endTime === statusInfo.startTime)) {
      statusInfo.endTime = null;
    }

    return statusInfo;
  },

  parseJobRunOutput: (output) => {
    // Parse the streaming output from fab job run command
    const lines = output.split('\n');
    const statusUpdates = [];
    let jobId = null;

    for (const line of lines) {
      // Extract job ID
      const jobIdMatch = line.match(/Job instance '([a-f0-9-]+)'/);
      if (jobIdMatch) {
        jobId = jobIdMatch[1];
      }

      // Extract status updates
      const statusMatch = line.match(/Job instance status: (\w+)/);
      if (statusMatch) {
        statusUpdates.push(statusMatch[1]);
      }
    }

    const finalStatus = output.includes('Completed') ? 'Completed' :
      output.includes('Failed') ? 'Failed' :
        statusUpdates[statusUpdates.length - 1] || 'Unknown';

    return {
      jobId,
      statusUpdates,
      finalStatus
    };
  },

  formatDateTime: (dateTimeStr) => {
    if (!dateTimeStr || dateTimeStr === 'None') return 'N/A';
    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleString();
    } catch {
      return dateTimeStr;
    }
  },

  isNotebook: (item) => {
    return typeof item === 'string' ? item.endsWith('.Notebook') : item.isNotebook;
  }
};

// History management
const loadHistory = async () => {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const saveHistory = async (history) => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history.slice(0, 50), null, 2));
};

// Custom Hooks
const useFabricState = () => {
  const [currentView, setCurrentView] = useState(VIEWS.MAIN);
  const [selectedOption, setSelectedOption] = useState(0);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(0);
  const [workspaceItems, setWorkspaceItems] = useState([]);
  const [selectedWorkspaceItem, setSelectedWorkspaceItem] = useState(0);
  const [inInteractiveMode, setInInteractiveMode] = useState(false);
  const [commandHistory, setCommandHistory] = useState([]);
  const [cache, setCache] = useState(new Map());
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [config, setConfig] = useState(null);
  const [activeJobs, setActiveJobs] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [selectedJobOption, setSelectedJobOption] = useState(0);
  const [selectedNotebookAction, setSelectedNotebookAction] = useState(0);
  const [currentNotebook, setCurrentNotebook] = useState(null);
  const [completedJobs, setCompletedJobs] = useState(new Set());

  useEffect(() => {
    // Load configuration and history on mount
    const init = async () => {
      const [loadedConfig, history] = await Promise.all([loadConfig(), loadHistory()]);
      setConfig(loadedConfig);
      setCommandHistory(history);
    };
    init();
  }, []);

  const resetState = useCallback(() => {
    setOutput('');
    setError('');
    setWorkspaces([]);
    setWorkspaceItems([]);
    setSelectedOption(0);
    setSelectedWorkspace(0);
    setSelectedWorkspaceItem(0);
    setSelectedNotebookAction(0);
    setCurrentNotebook(null);
    setCompletedJobs(new Set());
    setLoadingProgress(0);
  }, []);

  const addToHistory = useCallback(async (command, result) => {
    const entry = {
      command,
      timestamp: new Date().toISOString(),
      success: result.success,
      output: result.output?.substring(0, 200) // Store first 200 chars
    };

    const newHistory = [entry, ...commandHistory.slice(0, 49)];
    setCommandHistory(newHistory);
    await saveHistory(newHistory);
  }, [commandHistory]);

  const getCachedData = useCallback((key) => {
    const cached = cache.get(key);
    const timeout = config?.cacheTimeout || 300000;
    if (cached && Date.now() - cached.timestamp < timeout) {
      return cached.data;
    }
    return null;
  }, [cache, config]);

  const setCachedData = useCallback((key, data) => {
    setCache(prev => new Map(prev).set(key, {
      data,
      timestamp: Date.now()
    }));
  }, []);

  const addActiveJob = useCallback((jobId, workspace, notebook) => {
    setActiveJobs(prev => [...prev, { jobId, workspace, notebook, startTime: Date.now() }]);
  }, []);

  const markJobCompleted = useCallback((workspace, notebook) => {
    const jobKey = `${workspace}/${notebook}`;
    setCompletedJobs(prev => new Set([...prev, jobKey]));
  }, []);

  return {
    state: {
      currentView,
      selectedOption,
      output,
      loading,
      error,
      workspaces,
      selectedWorkspace,
      workspaceItems,
      selectedWorkspaceItem,
      inInteractiveMode,
      commandHistory,
      loadingProgress,
      config,
      activeJobs,
      currentJob,
      selectedJobOption,
      selectedNotebookAction,
      currentNotebook,
      completedJobs
    },
    actions: {
      setCurrentView,
      setSelectedOption,
      setOutput,
      setLoading,
      setError,
      setWorkspaces,
      setSelectedWorkspace,
      setWorkspaceItems,
      setSelectedWorkspaceItem,
      setInInteractiveMode,
      setLoadingProgress,
      resetState,
      addToHistory,
      getCachedData,
      setCachedData,
      setConfig,
      addActiveJob,
      setCurrentJob,
      setSelectedJobOption,
      setSelectedNotebookAction,
      setCurrentNotebook,
      markJobCompleted
    }
  };
};

const useCommandExecution = (actions, config) => {
  const executeCommand = useCallback(async (command, options = {}) => {
    const cacheKey = `${command}-${JSON.stringify(options)}`;

    // Check cache first
    if (!options.skipCache) {
      const cachedResult = actions.getCachedData(cacheKey);
      if (cachedResult) {
        if (!options.silent) {
          actions.setOutput(cachedResult.output);
          if (cachedResult.error) {
            actions.setError(cachedResult.error);
          }
        }
        return cachedResult;
      }
    }

    actions.setLoading(true);
    actions.setError('');

    // Simulate progress for user feedback
    const progressInterval = setInterval(() => {
      actions.setLoadingProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env, FORCE_COLOR: '0', ...options.env },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = {
        success: !stderr?.trim(),
        output: utils.cleanOutput(stdout),
        error: stderr?.trim(),
        command
      };

      // Cache successful results
      if (result.success && !options.skipCache) {
        actions.setCachedData(cacheKey, result);
      }

      if (result.success && !options.silent) {
        actions.setOutput(result.output);
      } else if (!result.success && !options.silent) {
        actions.setError(result.error);
      }

      actions.setLoadingProgress(100);

      // Save to history
      await actions.addToHistory(command, result);

      return result;
    } catch (err) {
      const error = err.name === 'AbortError'
        ? 'Command timed out. Try again or check your connection.'
        : `Error executing command: ${err.message}`;

      const result = { success: false, error, command };
      if (!options.silent) {
        actions.setError(error);
      }
      actions.setLoadingProgress(100);

      await actions.addToHistory(command, result);

      return result;
    } finally {
      clearInterval(progressInterval);
      actions.setLoading(false);
      setTimeout(() => actions.setLoadingProgress(0), 1000);
    }
  }, [actions]);

  const executeCommandWithRetry = useCallback(async (command, options = {}, maxRetries = null) => {
    const retries = maxRetries ?? config?.maxRetries ?? 2;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await executeCommand(command, {
          ...options,
          skipCache: attempt > 0 // Skip cache on retries
        });

        if (result.success) {
          return result;
        }

        lastError = result.error;

        if (attempt < retries) {
          actions.setError(`Attempt ${attempt + 1} failed. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      } catch (err) {
        lastError = err.message;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    actions.setError(`Command failed after ${retries + 1} attempts: ${lastError}`);
    return { success: false, error: lastError };
  }, [executeCommand, actions, config]);

  const executeCommandWithStatusUpdates = useCallback(async (command, options = {}) => {
    actions.setLoading(true);
    actions.setError('');

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], {
        env: { ...process.env, FORCE_COLOR: '0', ...options.env }
      });

      let output = '';
      let error = '';
      let statusCount = 0;

      // Update status periodically to show it's working
      const statusInterval = setInterval(() => {
        statusCount++;
        const dots = '.'.repeat((statusCount % 3) + 1);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        actions.setOutput(`🔄 Job is running${dots} (${elapsed}s elapsed)`);
      }, 1000); // Update every 1 second

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;

        // Only show important status updates
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.includes('Completed') || line.includes('Failed')) {
            const cleanLine = line.trim();
            if (cleanLine) {
              const elapsed = Math.floor((Date.now() - startTime) / 1000);
              actions.setOutput(`✅ Job completed (${elapsed}s)`);
            }
          }
        }
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        error += chunk;
      });

      child.on('close', async (code) => {
        clearInterval(statusInterval);
        actions.setLoading(false);

        const endTime = Date.now();
        const duration = Math.floor((endTime - startTime) / 1000);

        const result = {
          success: code === 0 && !error.trim(),
          output: utils.cleanOutput(output),
          error: error.trim(),
          command,
          duration
        };

        // Save to history
        await actions.addToHistory(command, result);

        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(error || `Command exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        clearInterval(statusInterval);
        actions.setLoading(false);
        actions.setError(`Error executing command: ${err.message}`);
        reject(err);
      });

      // Handle timeout
      if (options.timeout) {
        setTimeout(() => {
          clearInterval(statusInterval);
          child.kill();
          actions.setLoading(false);
          actions.setError('Command timed out');
          reject(new Error('Command timed out'));
        }, options.timeout);
      }
    });
  }, [actions]);

  return { executeCommand, executeCommandWithRetry, executeCommandWithStatusUpdates };
};

const useInputHandlers = (state, actions, handlers) => {
  const inputHandlers = useMemo(() => ({
    [VIEWS.MAIN]: (input, key) => {
      if (key.upArrow && state.selectedOption > 0) {
        actions.setSelectedOption(state.selectedOption - 1);
      } else if (key.downArrow && state.selectedOption < MENU_OPTIONS.length - 1) {
        actions.setSelectedOption(state.selectedOption + 1);
      } else if (key.return) {
        handlers.handleMenuSelection();
      } else if (input === 'q' || key.escape) {
        process.exit(0);
      }
    },

    [VIEWS.WORKSPACES]: (input, key) => {
      const maxSelection = state.workspaces.length; // +1 for return option
      if (key.upArrow && state.selectedWorkspace > 0) {
        actions.setSelectedWorkspace(state.selectedWorkspace - 1);
      } else if (key.downArrow && state.selectedWorkspace < maxSelection) {
        actions.setSelectedWorkspace(state.selectedWorkspace + 1);
      } else if (key.return) {
        if (state.selectedWorkspace === state.workspaces.length) {
          // Return option selected
          actions.setCurrentView(VIEWS.MAIN);
          actions.resetState();
        } else {
          // Workspace selected
          handlers.handleWorkspaceSelection();
        }
      } else if (key.escape || input === 'q') {
        actions.setCurrentView(VIEWS.MAIN);
        actions.resetState();
      } else if (input === 'r') {
        // Refresh shortcut
        handlers.refreshWorkspaces();
      }
    },

    [VIEWS.WORKSPACE_ITEMS]: (input, key) => {
      if (key.escape || input === 'q') {
        actions.setCurrentView(VIEWS.WORKSPACES);
        actions.setWorkspaceItems([]);
        actions.setSelectedWorkspaceItem(0);
        return;
      }

      const maxSelection = state.workspaceItems.length; // +1 for return option
      if (key.upArrow && state.selectedWorkspaceItem > 0) {
        actions.setSelectedWorkspaceItem(state.selectedWorkspaceItem - 1);
      } else if (key.downArrow && state.selectedWorkspaceItem < maxSelection) {
        actions.setSelectedWorkspaceItem(state.selectedWorkspaceItem + 1);
      } else if (key.return) {
        if (state.selectedWorkspaceItem === state.workspaceItems.length) {
          // Return option selected
          actions.setCurrentView(VIEWS.WORKSPACES);
          actions.setWorkspaceItems([]);
          actions.setSelectedWorkspaceItem(0);
        } else {
          // Item selected
          handlers.handleWorkspaceItemSelection();
        }
      }
    },

    [VIEWS.NOTEBOOK_ACTIONS]: (input, key) => {
      if (key.upArrow && state.selectedNotebookAction > 0) {
        actions.setSelectedNotebookAction(state.selectedNotebookAction - 1);
      } else if (key.downArrow && state.selectedNotebookAction < 3) {
        actions.setSelectedNotebookAction(state.selectedNotebookAction + 1);
      } else if (key.return) {
        handlers.handleNotebookActionSelection();
      } else if (key.escape || input === 'q') {
        actions.setCurrentView(VIEWS.WORKSPACE_ITEMS);
        actions.setSelectedNotebookAction(0);
        actions.setCurrentNotebook(null);
      }
    },

    [VIEWS.JOB_MENU]: (input, key) => {
      if (key.upArrow && state.selectedJobOption > 0) {
        actions.setSelectedJobOption(state.selectedJobOption - 1);
      } else if (key.downArrow && state.selectedJobOption < 2) {
        actions.setSelectedJobOption(state.selectedJobOption + 1);
      } else if (key.return) {
        handlers.handleJobMenuSelection();
      }
    },

    [VIEWS.COMMAND_HISTORY]: (input, key) => {
      if (key.escape || input === 'q') {
        actions.setCurrentView(VIEWS.MAIN);
      } else if (input === 'c') {
        // Clear history
        actions.setCommandHistory([]);
        saveHistory([]);
      }
    },

    [VIEWS.JOB_MENU]: (input, key) => {
      if (key.upArrow && state.selectedJobOption > 0) {
        actions.setSelectedJobOption(state.selectedJobOption - 1);
      } else if (key.downArrow && state.selectedJobOption < 2) {
        actions.setSelectedJobOption(state.selectedJobOption + 1);
      } else if (key.return) {
        handlers.handleJobMenuSelection();
      } else if (key.escape || input === 'q') {
        actions.setCurrentView(VIEWS.WORKSPACE_ITEMS);
        actions.setCurrentJob(null);
        actions.setSelectedJobOption(0);
      }
    },

    [VIEWS.JOB_STATUS]: (input, key) => {
      if (key.return || key.escape || input === 'q') {
        actions.setCurrentView(VIEWS.JOB_MENU);
      } else if (input === 'r') {
        // Refresh status
        handlers.checkJobStatus();
      }
    },

    [VIEWS.OUTPUT]: (input, key) => {
      if (key.escape || input === 'q') {
        // If we have a current notebook, go back to notebook actions
        if (state.currentNotebook) {
          actions.setCurrentView(VIEWS.NOTEBOOK_ACTIONS);
        } else {
          actions.setCurrentView(VIEWS.MAIN);
          actions.resetState();
        }
      }
    },

    default: (input, key) => {
      if (key.escape || input === 'q') {
        actions.setCurrentView(VIEWS.MAIN);
        actions.resetState();
      }
    }
  }), [state, actions, handlers]);

  return inputHandlers[state.currentView] || inputHandlers.default;
};

// Animated Weave Title Component
const AnimatedWeaveTitle = React.memo(() => {
  const [frame, setFrame] = useState(0);
  const [direction, setDirection] = useState(1); // 1 for forward, -1 for backward
  
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(prev => {
        const nextFrame = prev + direction;
        
        // If we've reached the end, reverse direction
        if (nextFrame >= 8) {
          setDirection(-1);
          return 8;
        }
        // If we've reached the beginning, go forward again
        if (nextFrame <= 0) {
          setDirection(1);
          return 0;
        }
        
        return nextFrame;
      });
    }, 500);
    
    return () => clearInterval(interval);
  }, [direction]);
  
  const getWeavePattern = (frame) => {
    const patterns = [
      'w   e   a   v   e',
      'w ─ e   a   v   e', 
      'w ─ e ─ a   v   e',
      'w ─ e ─ a ─ v   e',
      'w ─ e ─ a ─ v ─ e',
      'w │ e ─ a ─ v ─ e',
      'w │ e │ a ─ v ─ e',
      'w │ e │ a │ v ─ e',
      'w │ e │ a │ v │ e'
    ];
    return patterns[frame] || 'w   e   a   v   e';
  };
  
  return React.createElement(Text, { 
    bold: true, 
    color: COLORS.PRIMARY,
    fontSize: 24
  }, getWeavePattern(frame));
});

// UI Components
const MainMenu = React.memo(({ selectedOption }) => (
  React.createElement(Box, { flexDirection: 'column', padding: 1 }, [
    React.createElement(AnimatedWeaveTitle, { key: 'title' }),
    React.createElement(Box, { key: 'spacer', height: 1 }),
    ...MENU_OPTIONS.map((option, index) =>
      React.createElement(Text, {
        key: index,
        color: index === selectedOption ? 'black' : 'white',
        backgroundColor: index === selectedOption ? COLORS.HIGHLIGHT_BG : undefined
      },
        `${option.label}`
      )
    )
  ])
));

const WorkspacesList = React.memo(({ workspaces, selectedWorkspace, loading, error, loadingProgress }) => {
  const outputElements = [
    React.createElement(Text, { key: 'title', bold: true, color: COLORS.PRIMARY },
      'Workspaces'
    ),
    React.createElement(Box, { key: 'spacer', height: 1 })
  ];

  if (loading) {
    outputElements.push(
      React.createElement(Text, { key: 'loading', color: COLORS.WARNING }, '⏳ Loading workspaces...')
    );
  } else if (error) {
    outputElements.push(
      React.createElement(Text, { key: 'error-title', color: COLORS.ERROR, bold: true }, '❌ Error:'),
      React.createElement(Text, { key: 'error-text', color: COLORS.ERROR }, error),
      React.createElement(Text, { key: 'retry-tip', color: COLORS.SECONDARY, italic: true },
        'Press Enter to retry or check your network connection'
      )
    );
  } else if (workspaces.length > 0) {
    outputElements.push(
      React.createElement(Text, { key: 'workspace-title', color: COLORS.SUCCESS, bold: true },
        `Found ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}:`
      ),
      React.createElement(Box, { key: 'spacer2', height: 1 }),
      ...workspaces.map((workspace, index) =>
        React.createElement(Text, {
          key: `workspace-${index}`,
          color: index === selectedWorkspace ? 'black' : 'white',
          backgroundColor: index === selectedWorkspace ? COLORS.SUCCESS_BG : undefined
        },
          `${workspace}`
        )
      ),
      React.createElement(Box, { key: 'separator', height: 1 }),
      React.createElement(Text, {
        key: 'return-option',
        color: workspaces.length === selectedWorkspace ? 'black' : 'white',
        backgroundColor: workspaces.length === selectedWorkspace ? COLORS.SECONDARY : undefined
      },
        'Return to Main Menu'
      )
    );
  } else if (!loading) {
    outputElements.push(
      React.createElement(Text, { key: 'no-workspaces', color: COLORS.WARNING }, '⚠️  No workspaces found'),
      React.createElement(Text, { key: 'refresh-tip', color: COLORS.SECONDARY, italic: true },
        'Press Enter to retry or check your fabric CLI setup'
      )
    );
  }


  return React.createElement(Box, { flexDirection: 'column', padding: 1 }, outputElements);
});

const WorkspaceItems = React.memo(({ items, selectedItem, workspaceName, loading, error }) => {
  const outputElements = [
    React.createElement(Text, { key: 'title', bold: true, color: COLORS.PRIMARY },
      'Workspace Items'
    ),
    React.createElement(Box, { key: 'spacer', height: 1 })
  ];

  if (loading) {
    outputElements.push(
      React.createElement(Text, { key: 'loading', color: COLORS.WARNING }, '⏳ Loading workspace items...')
    );
  } else if (error) {
    outputElements.push(
      React.createElement(Text, { key: 'error-title', color: COLORS.ERROR, bold: true }, '❌ Error:'),
      React.createElement(Text, { key: 'error-text', color: COLORS.ERROR }, error),
      React.createElement(Box, { key: 'error-spacer', height: 1 }),
      React.createElement(Text, { key: 'return-instruction', color: COLORS.SECONDARY, italic: true },
        "Press 'q' or ESC to return to workspaces"
      )
    );
  } else if (items.length > 0) {
    // Group items by type
    const notebooks = items.filter(item => utils.isNotebook(item));
    const others = items.filter(item => !utils.isNotebook(item));

    outputElements.push(
      React.createElement(Text, { key: 'items-summary', color: COLORS.SECONDARY },
        `${notebooks.length} notebook${notebooks.length === 1 ? '' : 's'}, ${others.length} other item${others.length === 1 ? '' : 's'}`
      ),
      React.createElement(Box, { key: 'spacer2', height: 1 })
    );

    items.forEach((item, index) => {
      const isSelected = index === selectedItem;
      const itemObj = typeof item === 'string' ? { name: item, isNotebook: utils.isNotebook(item) } : item;

      outputElements.push(
        React.createElement(Text, {
          key: `item-${index}`,
          color: isSelected ? 'black' : 'white',
          backgroundColor: isSelected ? COLORS.WARNING_BG : undefined
        },
          `${itemObj.name}${itemObj.isNotebook ? ' 📓' : ''}`
        )
      );
    });
    
    // Add return option
    outputElements.push(
      React.createElement(Box, { key: 'separator', height: 1 }),
      React.createElement(Text, {
        key: 'return-option',
        color: items.length === selectedItem ? 'black' : 'white',
        backgroundColor: items.length === selectedItem ? COLORS.SECONDARY : undefined
      },
        'Return to Workspaces'
      )
    );
  } else if (!loading) {
    outputElements.push(
      React.createElement(Text, { key: 'no-items', color: COLORS.WARNING }, '⚠️  No items found in workspace'),
      React.createElement(Box, { key: 'empty-spacer', height: 1 }),
      React.createElement(Text, { key: 'empty-instruction', color: COLORS.SECONDARY, italic: true },
        "This workspace is empty. Press 'q' to return to workspaces"
      )
    );
  }


  return React.createElement(Box, { flexDirection: 'column', padding: 1 }, outputElements);
});

const CommandHistory = React.memo(({ history }) => {
  const outputElements = [
    React.createElement(Text, { key: 'title', bold: true, color: COLORS.PRIMARY },
      '📜 Command History'
    ),
    React.createElement(Text, { key: 'instructions', color: COLORS.SECONDARY },
      "Press 'c' to clear history, 'q' to return to main menu"
    ),
    React.createElement(Box, { key: 'spacer', height: 1 })
  ];

  if (history.length === 0) {
    outputElements.push(
      React.createElement(Text, { key: 'no-history', color: COLORS.WARNING }, 'No command history yet')
    );
  } else {
    history.slice(0, 10).forEach((entry, index) => {
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleTimeString();

      outputElements.push(
        React.createElement(Box, { key: `entry-${index}`, flexDirection: 'column', marginBottom: 1 }, [
          React.createElement(Text, { key: 'time', color: COLORS.SECONDARY }, `[${timeStr}]`),
          React.createElement(Text, {
            key: 'cmd',
            color: entry.success ? COLORS.SUCCESS : COLORS.ERROR
          }, `$ ${entry.command}`),
          entry.output && React.createElement(Text, {
            key: 'output',
            color: COLORS.SECONDARY,
            dimColor: true
          }, entry.output.substring(0, 80) + (entry.output.length > 80 ? '...' : ''))
        ])
      );
    });

    if (history.length > 10) {
      outputElements.push(
        React.createElement(Text, { key: 'more', color: COLORS.SECONDARY, italic: true },
          `... and ${history.length - 10} more entries`
        )
      );
    }
  }

  return React.createElement(Box, { flexDirection: 'column', padding: 1 }, outputElements);
});

const NotebookActionsMenu = React.memo(({ notebook, workspace, selectedOption, completedJobs, activeJobs, currentJob }) => {
  const jobKey = `${workspace}/${notebook}`;
  const hasJobCompleted = completedJobs && completedJobs.has(jobKey);
  
  // Check if there's an active job for this notebook
  const hasActiveJob = activeJobs && activeJobs.some(job => 
    job.workspace === workspace && job.notebook === notebook
  );
  
  // Check if current job is for this notebook
  const isCurrentJobForThis = currentJob && 
    currentJob.workspace === workspace && currentJob.notebook === notebook;

  const outputElements = [
    React.createElement(Text, { key: 'title', bold: true, color: COLORS.PRIMARY },
      `${notebook} (Notebook)`
    ),
    React.createElement(Box, { key: 'spacer1', height: 1 }),
    React.createElement(Text, { key: 'notebook-info', color: COLORS.PRIMARY },
      `📓 Notebook: ${notebook}`
    ),
    React.createElement(Text, { key: 'workspace-info', color: COLORS.PRIMARY },
      `📁 Workspace: ${workspace}`
    ),
    hasJobCompleted && React.createElement(Text, { key: 'job-status', color: COLORS.SUCCESS },
      `✅ Job has been run and completed`
    ),
    React.createElement(Box, { key: 'spacer2', height: 1 }),
    React.createElement(Text, { key: 'menu-title', color: COLORS.PRIMARY, bold: true },
      'What would you like to do?'
    ),
    React.createElement(Box, { key: 'spacer3', height: 1 })
  ];

  const options = [
    { label: 'Run (Start job in background)', action: 'run' },
    { label: 'Run Job Synchronously (Wait for completion)', action: 'run-sync' },
    { label: 'View Last Job Details', action: 'view-last-job' }
  ];

  options.forEach((option, index) => {
    outputElements.push(
      React.createElement(Text, {
        key: `option-${index}`,
        color: index === selectedOption ? 'black' : 'white',
        backgroundColor: index === selectedOption ? COLORS.WARNING_BG : undefined
      },
        `${option.label}`
      )
    );
  });

  // Add return option with same design pattern as other views
  outputElements.push(
    React.createElement(Box, { key: 'separator', height: 1 }),
    React.createElement(Text, {
      key: 'return-option',
      color: options.length === selectedOption ? 'black' : 'white',
      backgroundColor: options.length === selectedOption ? COLORS.SECONDARY : undefined
    },
      'Return to Workspace Items'
    )
  );


  return React.createElement(Box, { flexDirection: 'column', padding: 1 }, outputElements);
});

const JobMenu = React.memo(({ job, selectedOption }) => {
  const outputElements = [
    React.createElement(Text, { key: 'title', bold: true, color: COLORS.SUCCESS },
      '✅ Job Started Successfully!'
    ),
    React.createElement(Box, { key: 'spacer1', height: 1 }),
    React.createElement(Text, { key: 'job-info', color: COLORS.PRIMARY },
      `📓 Notebook: ${job.notebook}`
    ),
    React.createElement(Text, { key: 'workspace-info', color: COLORS.PRIMARY },
      `📁 Workspace: ${job.workspace}`
    ),
    React.createElement(Text, { key: 'job-id', color: COLORS.SECONDARY },
      `🔖 Job ID: ${job.jobId}`
    ),
    React.createElement(Box, { key: 'spacer2', height: 1 }),
    React.createElement(Text, { key: 'menu-title', color: COLORS.PRIMARY, bold: true },
      'What would you like to do?'
    ),
    React.createElement(Box, { key: 'spacer3', height: 1 })
  ];

  const options = [
    { label: 'Check Job Status', action: 'status' },
    { label: 'Run Job Synchronously (Wait for completion)', action: 'run-sync' },
    { label: 'Return to Workspace Items', action: 'return' }
  ];

  options.forEach((option, index) => {
    outputElements.push(
      React.createElement(Text, {
        key: `option-${index}`,
        color: index === selectedOption ? 'black' : 'white',
        backgroundColor: index === selectedOption ? COLORS.WARNING_BG : undefined
      },
        `${option.label}`
      )
    );
  });

  outputElements.push(
    React.createElement(Box, { key: 'spacer4', height: 1 }),
    React.createElement(Text, { key: 'instructions', color: COLORS.SECONDARY, italic: true },
      'Use ↑/↓ to navigate, Enter to select'
    )
  );

  return React.createElement(Box, { flexDirection: 'column', padding: 1 }, outputElements);
});

const JobStatusView = React.memo(({ output, jobInfo, loading, error }) => {
  const outputElements = [
    React.createElement(Text, { key: 'title', bold: true, color: COLORS.PRIMARY },
      '📊 Job Status'
    ),
    React.createElement(Text, { key: 'job-info', color: COLORS.SECONDARY },
      `Notebook: ${jobInfo.notebook}`
    ),
    React.createElement(Box, { key: 'spacer', height: 1 })
  ];

  if (loading) {
    outputElements.push(
      React.createElement(Text, { key: 'loading', color: COLORS.WARNING }, '⏳ Checking job status...')
    );
  } else if (error) {
    outputElements.push(
      React.createElement(Text, { key: 'error-title', color: COLORS.ERROR, bold: true }, '❌ Error:'),
      React.createElement(Text, { key: 'error-text', color: COLORS.ERROR }, error)
    );
  } else if (output) {
    const statusInfo = utils.parseJobStatus(output);

    // Status with appropriate color and icon
    let statusColor = COLORS.WARNING;
    let statusIcon = '⏳';

    if (statusInfo.status === 'Completed' || statusInfo.status === 'Succeeded') {
      statusColor = COLORS.SUCCESS;
      statusIcon = '✅';
    } else if (statusInfo.status === 'Failed') {
      statusColor = COLORS.ERROR;
      statusIcon = '❌';
    } else if (statusInfo.status === 'InProgress') {
      statusColor = COLORS.WARNING;
      statusIcon = '🔄';
    }

    outputElements.push(
      React.createElement(Text, { key: 'status', bold: true, color: statusColor },
        `${statusIcon} Status: ${statusInfo.status}`
      ),
      React.createElement(Text, { key: 'start-time', color: COLORS.PRIMARY },
        `🕐 Start Time: ${utils.formatDateTime(statusInfo.startTime)}`
      ),
      React.createElement(Text, { key: 'end-time', color: COLORS.PRIMARY },
        `🏁 End Time: ${statusInfo.endTime ? utils.formatDateTime(statusInfo.endTime) : 'Still running...'}`
      )
    );
    
    if (statusInfo.status === 'InProgress') {
      outputElements.push(
        React.createElement(Box, { key: 'spacer3', height: 1 }),
        React.createElement(Text, { key: 'duration', color: COLORS.SECONDARY, italic: true },
          `Running for ${Math.floor((Date.now() - jobInfo.startTime) / 1000)} seconds...`
        )
      );
    }
  }

  outputElements.push(
    React.createElement(Box, { key: 'spacer-final', height: 1 }),
    React.createElement(Text, { key: 'instructions', color: COLORS.SECONDARY, italic: true },
      "Press 'r' to refresh, Enter to return to job menu, 'q' to return to main menu"
    )
  );

  return React.createElement(Box, { flexDirection: 'column', padding: 1 }, outputElements);
});

const OutputView = React.memo(({ output, error, loading, title, activeJobs, currentNotebook }) => {
  const outputElements = [
    React.createElement(Text, { key: 'title', bold: true, color: COLORS.PRIMARY },
      `📋 ${title || 'Output'}`
    ),
    React.createElement(Box, { key: 'spacer', height: 1 })
  ];

  // Loading handled by specific operations

  if (error) {
    outputElements.push(
      React.createElement(Text, { key: 'error-title', color: COLORS.ERROR, bold: true }, '❌ Error:'),
      React.createElement(Text, { key: 'error-text', color: COLORS.ERROR }, error)
    );
  }

  if (output) {
    // Always display output in a clean, minimal way
    const lines = output.split('\n');

    lines.forEach((line, index) => {
      if (line.trim()) {
        let color = COLORS.PRIMARY;
        let bold = false;

        // Style different types of lines appropriately
        if (line.includes('🔄') || line.includes('Starting')) {
          color = COLORS.PRIMARY;
          bold = true;
        } else if (line.includes('⏳') || line.includes('running')) {
          color = COLORS.WARNING;
        } else if (line.includes('✅') || line.includes('completed')) {
          color = COLORS.SUCCESS;
          bold = true;
        } else if (line.includes('❌') || line.includes('failed')) {
          color = COLORS.ERROR;
          bold = true;
        } else if (line.includes('💡 Press')) {
          color = COLORS.SECONDARY;
        }

        outputElements.push(
          React.createElement(Text, {
            key: `line-${index}`,
            color,
            bold
          }, line)
        );
      } else {
        // Empty line for spacing
        outputElements.push(
          React.createElement(Box, { key: `spacer-${index}`, height: 1 })
        );
      }
    });
  }

  // Active jobs display removed

  if (!loading && !output && !error) {
    outputElements.push(
      React.createElement(Text, { key: 'no-output', color: COLORS.WARNING }, 'No output received')
    );
  }

  return React.createElement(Box, {
    flexDirection: 'column',
    padding: 1,
    height: '100%',
    overflowY: 'hidden'
  }, outputElements);
});

const ErrorBoundary = ({ children, fallback }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return fallback || React.createElement(Text, { color: COLORS.ERROR }, 'Something went wrong!');
  }

  return children;
};

// ASCII Art Component
const LoadingScreen = React.memo(() => {
  const asciiArt = `
██╗    ██╗███████╗ █████╗ ██╗   ██╗███████╗
██║    ██║██╔════╝██╔══██╗██║   ██║██╔════╝
██║ █╗ ██║█████╗  ███████║██║   ██║█████╗  
██║███╗██║██╔══╝  ██╔══██║╚██╗ ██╔╝██╔══╝  
╚███╔███╔╝███████╗██║  ██║ ╚████╔╝ ███████╗
 ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝
                                           `;

  return React.createElement(Box, {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%'
  }, [
    React.createElement(Text, {
      key: 'ascii',
      color: COLORS.PRIMARY,
      bold: true
    }, asciiArt),
    React.createElement(Text, {
      key: 'version',
      color: COLORS.SECONDARY,
      dimColor: true
    }, 'v0.1.0')
  ]);
});

// Main Application Component
const FabricCLI = () => {
  const { state, actions } = useFabricState();
  const { executeCommand, executeCommandWithRetry, executeCommandWithStatusUpdates } = useCommandExecution(actions, state.config);
  const { exit } = useApp();
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);

  // Show loading screen for 1 second on startup
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowLoadingScreen(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);


  const handleInteractiveShell = useCallback(() => {
    exit();
    setTimeout(() => {
      console.clear();
      console.log('Starting Fabric Interactive Shell...');
      console.log('When you exit, run "npm start" or "node index.js" to restart the TUI.\n');

      const child = spawn('fab', ['auth', 'login'], {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
          FABRIC_DISABLE_CPR: '1'
        }
      });

      const handleExit = () => {
        console.log('\nInteractive shell closed.');
        console.log('Run "npm start" or "node index.js" to restart the TUI.');
        process.exit(0);
      };

      child.on('close', handleExit);
      child.on('exit', handleExit);
      child.on('error', (err) => {
        console.error('Error starting interactive shell:', err.message);
        console.log('Run "npm start" or "node index.js" to restart the TUI.');
        process.exit(1);
      });
    }, 100);
  }, [exit]);

  const handleMenuSelection = useCallback(async () => {
    const selected = MENU_OPTIONS[state.selectedOption];

    if (selected.action === 'exit') {
      process.exit(0);
      return;
    }

    if (selected.action === 'interactive') {
      handleInteractiveShell();
      return;
    }

    if (selected.action === 'history') {
      actions.setCurrentView(VIEWS.COMMAND_HISTORY);
      return;
    }

    actions.setCurrentView(selected.view || VIEWS.OUTPUT);
    actions.setWorkspaces([]);
    actions.setSelectedWorkspace(0);

    // Use retry logic for workspace loading
    const result = selected.command === COMMANDS.LIST_WORKSPACES
      ? await executeCommandWithRetry(selected.command, { timeout: 15000 })
      : await executeCommand(selected.command);

    if (result.success && selected.command === COMMANDS.LIST_WORKSPACES) {
      const workspaceList = utils.parseWorkspaces(result.output);
      actions.setWorkspaces(workspaceList);
    }
  }, [state.selectedOption, actions, executeCommand, executeCommandWithRetry, exit, handleInteractiveShell]);

  const handleWorkspaceSelection = useCallback(async () => {
    if (state.workspaces.length === 0) return;

    const selectedWorkspaceName = state.workspaces[state.selectedWorkspace];
    const command = COMMANDS.LIST_WORKSPACE(selectedWorkspaceName);

    // Switch to workspace items view first to show correct loading message
    actions.setCurrentView(VIEWS.WORKSPACE_ITEMS);
    actions.setWorkspaceItems([]);
    actions.setSelectedWorkspaceItem(0);

    const result = await executeCommand(command);

    if (result.success) {
      const items = utils.parseWorkspaceItems(result.output);
      actions.setWorkspaceItems(items);
    } else {
      actions.setCurrentView(VIEWS.WORKSPACES);
    }
  }, [state.workspaces, state.selectedWorkspace, actions, executeCommand]);

  const handleWorkspaceItemSelection = useCallback(async () => {
    if (state.workspaceItems.length === 0) return;

    const selectedItem = state.workspaceItems[state.selectedWorkspaceItem];
    const selectedWorkspaceName = state.workspaces[state.selectedWorkspace];

    // Handle both string and object formats
    const itemName = typeof selectedItem === 'string' ? selectedItem : selectedItem.name;
    const isNotebook = utils.isNotebook(selectedItem);

    if (isNotebook) {
      // Show notebook actions menu instead of directly running
      actions.setCurrentNotebook({
        name: itemName,
        workspace: selectedWorkspaceName
      });
      actions.setSelectedNotebookAction(0);
      actions.setCurrentView(VIEWS.NOTEBOOK_ACTIONS);
    } else {
      actions.setError(`Selected item "${itemName}" is not a notebook. Only .Notebook items can be started.`);
      actions.setCurrentView(VIEWS.OUTPUT);
    }
  }, [state.workspaceItems, state.selectedWorkspaceItem, state.workspaces, state.selectedWorkspace, actions]);

  const handleNotebookActionSelection = useCallback(async () => {
    if (!state.currentNotebook) return;

    const options = [
      { action: 'run' },
      { action: 'run-sync' },
      { action: 'view-last-job' },
      { action: 'return' }
    ];

    const selected = options[state.selectedNotebookAction];

    if (selected.action === 'run') {
      // Start the job in background and show success message
      const command = COMMANDS.JOB_START(state.currentNotebook.workspace, state.currentNotebook.name);
      actions.setCurrentView(VIEWS.OUTPUT);
      actions.setOutput('🚀 Starting job in background...');
      
      const result = await executeCommand(command, { silent: true });

      if (result.success) {
        const jobId = utils.formatJobId(result.output);
        if (jobId) {
          actions.addActiveJob(jobId, state.currentNotebook.workspace, state.currentNotebook.name);
          actions.setOutput(
            `✅ Job started successfully in background\n\n` +
            `📍 Job ID: ${jobId}\n\n` +
            `💡 Use 'View Last Job Details' to check status\n\n` +
            `💡 Press 'q' or ESC to return to notebook actions menu`
          );
        } else {
          actions.setOutput(
            `❌ Failed to extract job ID\n\n💡 Press 'q' or ESC to return to notebook actions menu`
          );
        }
      } else {
        actions.setOutput(
          `❌ Failed to start job: ${result.error}\n\n💡 Press 'q' or ESC to return to notebook actions menu`
        );
      }
    } else if (selected.action === 'run-sync') {
      // Run job synchronously with status updates
      const command = COMMANDS.JOB_RUN_SYNC(state.currentNotebook.workspace, state.currentNotebook.name);

      actions.setCurrentView(VIEWS.OUTPUT);
      actions.setOutput('🔄 Starting synchronous job execution...\n');

      try {
        const result = await executeCommandWithStatusUpdates(command, { timeout: 600000 }); // 10 minute timeout

        if (result.success) {
          const runInfo = utils.parseJobRunOutput(result.output);
          actions.markJobCompleted(state.currentNotebook.workspace, state.currentNotebook.name);
          actions.setOutput(
            `✅ Job completed successfully (${result.duration}s)\n\n` +
            `💡 Press 'q' or ESC to return to notebook actions menu`
          );
        }
      } catch (error) {
        actions.markJobCompleted(state.currentNotebook.workspace, state.currentNotebook.name);
        actions.setOutput(`❌ Job failed: ${error.message}\n\n💡 Press 'q' or ESC to return to notebook actions menu`);
      }
    } else if (selected.action === 'view-last-job') {
      // View last job details - first get job list to find latest job ID
      const listCommand = COMMANDS.JOB_LIST(state.currentNotebook.workspace, state.currentNotebook.name);
      actions.setCurrentView(VIEWS.OUTPUT);
      actions.setOutput('🔍 Getting job details...');
      
      const listResult = await executeCommand(listCommand, { skipCache: true, silent: true });
      if (listResult.success) {
        // Parse job list to find the most recent job ID
        // Look for any job ID in the entire output (most recent should be first)
        const jobIdMatch = listResult.output.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
        
        if (jobIdMatch) {
          const jobId = jobIdMatch[1];
          // Now get detailed status using run-status command
          const statusCommand = COMMANDS.JOB_STATUS(state.currentNotebook.workspace, state.currentNotebook.name, jobId);
          const statusResult = await executeCommand(statusCommand, { skipCache: true });
          
          if (statusResult.success) {
            const statusInfo = utils.parseJobStatus(statusResult.output);
            
            actions.setOutput(
              `📊 Last Job Details:\n\n` +
              `🔖 Job ID: ${jobId}\n` +
              `📋 Status: ${statusInfo.status}\n` +
              `🕐 Start Time: ${utils.formatDateTime(statusInfo.startTime)}\n` +
              `🏁 End Time: ${statusInfo.endTime ? utils.formatDateTime(statusInfo.endTime) : 'Still running...'}\n\n` +
              `💡 Press 'q' or ESC to return to notebook actions menu`
            );
          } else {
            actions.setOutput(
              `❌ Failed to get job details\n\n💡 Press 'q' or ESC to return to notebook actions menu`
            );
          }
        } else {
          actions.setOutput(
            `ℹ️ No job history found for this notebook\n\n💡 Press 'q' or ESC to return to notebook actions menu`
          );
        }
      } else {
        actions.setOutput(
          `❌ Failed to get job list\n\n💡 Press 'q' or ESC to return to notebook actions menu`
        );
      }
    } else if (selected.action === 'return') {
      // Return to workspace items
      actions.setCurrentView(VIEWS.WORKSPACE_ITEMS);
      actions.setSelectedNotebookAction(0);
      actions.setCurrentNotebook(null);
    }
  }, [state.currentNotebook, state.selectedNotebookAction, actions, executeCommand, executeCommandWithStatusUpdates]);

  const checkJobStatus = useCallback(async () => {
    if (!state.currentJob) return;

    const command = COMMANDS.JOB_STATUS(
      state.currentJob.workspace,
      state.currentJob.notebook,
      state.currentJob.jobId
    );

    const result = await executeCommand(command, { skipCache: true });

    // Check if job is completed and mark it
    if (result.success) {
      const statusInfo = utils.parseJobStatus(result.output);
      if (statusInfo.status === 'Completed' || statusInfo.status === 'Succeeded' || statusInfo.status === 'Failed') {
        actions.markJobCompleted(state.currentJob.workspace, state.currentJob.notebook);
      }
    }
  }, [state.currentJob, executeCommand, actions]);

  const handleJobMenuSelection = useCallback(async () => {
    if (!state.currentJob) return;

    const options = [
      { action: 'status' },
      { action: 'run-sync' },
      { action: 'return' }
    ];

    const selected = options[state.selectedJobOption];

    if (selected.action === 'status') {
      // Check job status
      actions.setCurrentView(VIEWS.JOB_STATUS);
      await checkJobStatus();
    } else if (selected.action === 'run-sync') {
      // Run job synchronously with status updates
      const command = COMMANDS.JOB_RUN_SYNC(
        state.currentJob.workspace,
        state.currentJob.notebook
      );

      actions.setCurrentView(VIEWS.OUTPUT);
      actions.setOutput('🔄 Starting synchronous job execution...\n');

      try {
        const result = await executeCommandWithStatusUpdates(command, { timeout: 600000 }); // 10 minute timeout

        if (result.success) {
          const runInfo = utils.parseJobRunOutput(result.output);
          actions.setOutput(
            `✅ Job completed successfully (${result.duration}s)\n\n` +
            `💡 Press 'q' or ESC to return to main menu`
          );
        }
      } catch (error) {
        actions.setOutput(`❌ Job failed: ${error.message}\n\n💡 Press 'q' or ESC to return to main menu`);
      }
    } else if (selected.action === 'return') {
      // Return to workspace items
      actions.setCurrentView(VIEWS.WORKSPACE_ITEMS);
      actions.setSelectedJobOption(0);
    }
  }, [state.currentJob, state.selectedJobOption, actions, checkJobStatus, executeCommand, executeCommandWithStatusUpdates]);

  const refreshWorkspaces = useCallback(async () => {
    const result = await executeCommandWithRetry(COMMANDS.LIST_WORKSPACES, {
      timeout: 15000,
      skipCache: true
    });

    if (result.success) {
      const workspaceList = utils.parseWorkspaces(result.output);
      actions.setWorkspaces(workspaceList);
    }
  }, [executeCommandWithRetry, actions]);

  const showHelp = useCallback((context) => {
    const helpTexts = {
      'main': 
        'Main Menu Help:\\n\\n' +
        '↑/↓ - Navigate options\\n' +
        'Enter - Select option\\n' +
        'h - Show this help\\n' +
        'q/ESC - Quit application',
      'workspaces': 
        'Workspaces Help:\\n\\n' +
        '↑/↓ - Navigate workspaces\\n' +
        'Enter - Select workspace\\n' +
        'r - Refresh workspaces\\n' +
        'h - Show this help\\n' +
        'q/ESC - Return to main menu',
      'workspace-items': 
        'Workspace Items Help:\\n\\n' +
        '↑/↓ - Navigate items\\n' +
        'Enter - Select .Notebook items\\n' +
        'h - Show this help\\n' +
        'q/ESC - Return to workspaces',
      'notebook-actions': 
        'Notebook Actions Help:\\n\\n' +
        '↑/↓ - Navigate options\\n' +
        'Enter - Select action\\n' +
        'h - Show this help\\n' +
        'q/ESC - Return to workspace items'
    };
    
    actions.setCurrentView(VIEWS.OUTPUT);
    actions.setOutput(helpTexts[context] || 'Help not available for this view');
  }, [actions]);

  const handlers = useMemo(() => ({
    handleMenuSelection,
    handleWorkspaceSelection,
    handleWorkspaceItemSelection,
    handleNotebookActionSelection,
    handleJobMenuSelection,
    checkJobStatus,
    refreshWorkspaces,
    showHelp
  }), [handleMenuSelection, handleWorkspaceSelection, handleWorkspaceItemSelection, handleNotebookActionSelection, handleJobMenuSelection, checkJobStatus, refreshWorkspaces, showHelp]);

  const currentInputHandler = useInputHandlers(state, actions, handlers);

  useInput((input, key) => {
    if (state.inInteractiveMode) return;

    currentInputHandler(input, key);

    if (input === 'q' && state.currentView === VIEWS.MAIN) {
      exit();
    }
  });

  // Don't render anything while in interactive mode
  if (state.inInteractiveMode) {
    return React.createElement(Box, {}, []);
  }

  // Show loading screen on startup
  if (showLoadingScreen) {
    return React.createElement(LoadingScreen);
  }

  // Render appropriate view
  return React.createElement(ErrorBoundary, {},
    (() => {
      switch (state.currentView) {
        case VIEWS.MAIN:
          return React.createElement(MainMenu, {
            selectedOption: state.selectedOption
          });

        case VIEWS.WORKSPACES:
          return React.createElement(WorkspacesList, {
            workspaces: state.workspaces,
            selectedWorkspace: state.selectedWorkspace,
            loading: state.loading,
            error: state.error,
            loadingProgress: state.loadingProgress
          });

        case VIEWS.WORKSPACE_ITEMS:
          return React.createElement(WorkspaceItems, {
            items: state.workspaceItems,
            selectedItem: state.selectedWorkspaceItem,
            workspaceName: state.workspaces[state.selectedWorkspace],
            loading: state.loading,
            error: state.error
          });

        case VIEWS.COMMAND_HISTORY:
          return React.createElement(CommandHistory, {
            history: state.commandHistory
          });

        case VIEWS.NOTEBOOK_ACTIONS:
          return React.createElement(NotebookActionsMenu, {
            notebook: state.currentNotebook?.name,
            workspace: state.currentNotebook?.workspace,
            selectedOption: state.selectedNotebookAction,
            completedJobs: state.completedJobs,
            activeJobs: state.activeJobs,
            currentJob: state.currentJob
          });

        case VIEWS.JOB_MENU:
          return React.createElement(JobMenu, {
            job: state.currentJob,
            selectedOption: state.selectedJobOption
          });

        case VIEWS.JOB_STATUS:
          return React.createElement(JobStatusView, {
            output: state.output,
            jobInfo: state.currentJob,
            loading: state.loading,
            error: state.error
          });

        case VIEWS.OUTPUT:
          return React.createElement(OutputView, {
            output: state.output,
            error: state.error,
            loading: state.loading,
            title: MENU_OPTIONS[state.selectedOption]?.label,
            activeJobs: state.activeJobs,
            currentNotebook: state.currentNotebook
          });

        default:
          return React.createElement(MainMenu, {
            selectedOption: state.selectedOption
          });
      }
    })()
  );
};

// Clear console on startup to hide npm output
console.clear();

render(React.createElement(FabricCLI));
