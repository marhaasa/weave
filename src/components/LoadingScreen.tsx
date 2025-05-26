import React, { useState, useEffect } from 'react';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBox, createText } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LoadingScreen: React.FC = React.memo(() => {
  const [version, setVersion] = useState<string>('v0.1.3');

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const packageJsonPath = path.resolve(__dirname, '../../package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        setVersion(`v${packageJson.version}`);
      } catch (error) {
        console.error('Failed to load version from package.json:', error);
      }
    };

    loadVersion();
  }, []);

  const asciiArt = `
██╗    ██╗███████╗ █████╗ ██╗   ██╗███████╗
██║    ██║██╔════╝██╔══██╗██║   ██║██╔════╝
██║ █╗ ██║█████╗  ███████║██║   ██║█████╗  
██║███╗██║██╔══╝  ██╔══██║╚██╗ ██╔╝██╔══╝  
╚███╔███╔╝███████╗██║  ██║ ╚████╔╝ ███████╗
 ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝`;

  return createBox({
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%'
  }, [
    createText({ key: 'ascii', color: COLORS.PRIMARY, bold: true }, asciiArt),
    createText({ key: 'version', color: COLORS.SECONDARY, dimColor: true }, version)
  ]);
});