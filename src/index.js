import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { supabase } from './supabase';

const hash = window.location.hash;
if(hash.includes('access_token')){
  const params = new URLSearchParams(hash.substring(1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if(access_token && refresh_token){
    window.history.replaceState(null, '', window.location.pathname);
    supabase.auth.setSession({ access_token, refresh_token })
      .then(({data, error})=>{
        console.log('setSession result:', JSON.stringify({data: !!data?.session, error}));
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