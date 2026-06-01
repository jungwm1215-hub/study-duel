import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { supabase } from './supabase';

// OAuth hash 토큰을 앱 마운트 전에 먼저 처리
const hash = window.location.hash;
if(hash.includes('access_token')){
  const params = new URLSearchParams(hash.substring(1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if(access_token && refresh_token){
    supabase.auth.setSession({ access_token, refresh_token }).then(()=>{
      window.history.replaceState(null, '', window.location.pathname);
    });
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
reportWebVitals();