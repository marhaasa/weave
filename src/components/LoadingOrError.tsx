import React from 'react';
import { createBox, createLoadingDisplay, createErrorDisplay } from '../utils/uiHelpers.js';

interface LoadingOrErrorProps {
  loading: boolean;
  error: string;
  loadingMessage?: string;
}

export const LoadingOrError: React.FC<LoadingOrErrorProps> = ({ loading, error, loadingMessage = 'Loading...' }) => {
  if (loading) return createLoadingDisplay(loadingMessage);
  if (error) return createBox({ flexDirection: 'column' }, createErrorDisplay(error));
  return null;
};