import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { msalInstance } from './auth/msalConfig.ts';
import './index.css';

const staleRedirectRecoveryKey = 'line-balancing.msal.stale-redirect-recovery';

async function bootstrap() {
  await msalInstance.initialize();
  try {
    const result = await msalInstance.handleRedirectPromise();
    const account = result?.account ?? msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
    if (account) msalInstance.setActiveAccount(account);
    sessionStorage.removeItem(staleRedirectRecoveryKey);
  } catch (error) {
    if (!sessionStorage.getItem(staleRedirectRecoveryKey)) {
      sessionStorage.setItem(staleRedirectRecoveryKey, '1');
      await msalInstance.clearCache();
      window.location.replace(msalInstance.getConfiguration().auth.redirectUri);
      return;
    } else {
      console.error('Unable to recover the Entra redirect response.', error);
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider><App /></AuthProvider>
    </StrictMode>,
  );
}

void bootstrap();
