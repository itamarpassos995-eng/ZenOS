import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import EnvironmentBanner from './components/EnvironmentBanner.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EnvironmentBanner />
    <App />
  </React.StrictMode>,
)
