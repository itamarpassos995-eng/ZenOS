import React from 'react';
import {createRoot} from 'react-dom/client';
const Central=React.lazy(()=>import('./components/DistributionCentral.jsx'));
const enabled=import.meta.env.MODE==='homologacao'&&['localhost','127.0.0.1'].includes(location.hostname);
createRoot(document.getElementById('root')).render(enabled?<React.Suspense fallback={<p>ZenOS…</p>}><Central/></React.Suspense>:<p>ZenOS</p>);
