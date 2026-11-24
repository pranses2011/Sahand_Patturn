import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorBoot } from './EditorBoot';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EditorBoot />
  </React.StrictMode>,
);
