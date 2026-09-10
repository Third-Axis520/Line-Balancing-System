import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { msalEnabled, msalInstance } from './auth/msalConfig.ts';
import './index.css';

const staleRedirectRecoveryKey = 'line-balancing.msal.stale-redirect-recovery';

async function bootstrap() {
  const render = () => createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider><App /></AuthProvider>
    </StrictMode>,
  );

  if (!msalEnabled || !msalInstance) {
    render();
    return;
  }

  try {
    await msalInstance.initialize();
  } catch (error) {
    console.error('Unable to initialize Entra authentication; continuing as a reader.', error);
    render();
    return;
  }

  try {
    const result = await msalInstance.handleRedirectPromise();
    const account = result?.account ?? msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
    if (account) msalInstance.setActiveAccount(account);
    sessionStorage.removeItem(staleRedirectRecoveryKey);
  } catch (error) {
    if (!sessionStorage.getItem(staleRedirectRecoveryKey)) {
      sessionStorage.setItem(staleRedirectRecoveryKey, '1');
      try {
        await msalInstance.clearCache();
        window.location.replace(msalInstance.getConfiguration().auth.redirectUri);
        return;
      } catch (recoveryError) {
        console.error('Unable to recover the Entra redirect response; continuing as a reader.', recoveryError);
      }
    } else {
      console.error('Unable to recover the Entra redirect response; continuing as a reader.', error);
    }
  }

  render();
}

void bootstrap();
