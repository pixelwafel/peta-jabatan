import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { bootstrapPersistence } from './persistence/bootstrap';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);

  // Mount React UI immediately
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );

  // Initialize persistence asynchronously
  bootstrapPersistence().catch(err => {
    console.error('Failed to initialize persistence bootstrap:', err);
  });
}
