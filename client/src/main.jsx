import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { SocketProvider } from './context/SocketContext';
import { SosProvider } from './context/SosContext';
import { Toaster } from './components/ui';
import './styles/global.css';
import './styles/components.css';

/*
 * Provider order matters. Toast is outermost because everything below it
 * reports through toasts; Auth comes next because Socket and Sos both need to
 * know who is signed in; Sos is innermost because it uses all three.
 */
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <SosProvider>
              <App />
              <Toaster />
            </SosProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
