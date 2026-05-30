/**
 * React Application Entry Point
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './styles/globals.css';
import 'katex/dist/katex.min.css';
import { initializeDefaultTransports } from './lib/api-client';
import { bootstrapWebDev } from './lib/web-dev-bootstrap';

async function startApp(): Promise<void> {
  await bootstrapWebDev();
  initializeDefaultTransports();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  );
}

void startApp().catch((error) => {
  console.error('Failed to start PingClaw:', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding:40px;font-family:system-ui,sans-serif;color:#f87171;background:#0f172a;min-height:100vh">
        <h1 style="font-size:24px;margin-bottom:12px">Failed to start PingClaw (web dev)</h1>
        <pre style="white-space:pre-wrap;background:#1e293b;padding:16px;border-radius:8px;color:#e2e8f0">${String(error instanceof Error ? error.message : error)}</pre>
        <p style="color:#94a3b8;margin-top:16px">Run <code style="color:#e2e8f0">pnpm dev:web</code> from the PingClaw directory.</p>
      </div>
    `;
  }
});
