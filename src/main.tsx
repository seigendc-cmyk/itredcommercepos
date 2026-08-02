import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const qaFixtureEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('qa') === 'stocktake';
const StocktakeAcceptanceFixture = import.meta.env.DEV ? lazy(() => import('./qa/StocktakeAcceptanceFixture.tsx')) : null;
const RootApplication = qaFixtureEnabled && StocktakeAcceptanceFixture ? StocktakeAcceptanceFixture : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div>Loading isolated QA fixture…</div>}><RootApplication /></Suspense>
  </StrictMode>,
);
