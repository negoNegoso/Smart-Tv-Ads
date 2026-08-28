import { createRoot } from 'react-dom/client';

import App from './App';
import { installAuthFetchGuard } from './lib/auth-fetch-guard';

import './index.css';

installAuthFetchGuard();

createRoot(document.getElementById('root')!).render(<App />);
