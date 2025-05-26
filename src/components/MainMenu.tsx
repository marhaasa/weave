import React, { useMemo } from 'react';
import { AnimatedWeaveTitle } from './AnimatedWeaveTitle.js';
import { createBox, createMenuItem, spacer, h } from '../utils/uiHelpers.js';
import { CommandBuilder } from '../utils/commandBuilder.js';
import { VIEWS } from '../constants/index.js';

interface MainMenuProps {
  selectedOption: number;
}

export const MainMenu: React.FC<MainMenuProps> = React.memo(({ selectedOption }) => {
  const menuOptions = useMemo(() => [
    { label: 'Workspaces', command: CommandBuilder.listWorkspaces(), view: VIEWS.WORKSPACES },
    { label: 'Manual Interactive Shell', action: 'interactive' },
    { label: 'Command History', action: 'history', view: VIEWS.COMMAND_HISTORY },
    { label: 'Exit', action: 'exit' }
  ], []);

  return createBox({ flexDirection: 'column', padding: 1 }, [
    h(AnimatedWeaveTitle, { key: 'title' }),
    spacer(),
    ...menuOptions.map((option, index) =>
      createMenuItem(option.label, index, selectedOption)
    )
  ]);
});