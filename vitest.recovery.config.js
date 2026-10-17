import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],test:{include:['scripts/recovery/*.ui.test.jsx'],environment:'jsdom',pool:'forks',poolOptions:{forks:{singleFork:true}},testTimeout:120000,hookTimeout:180000}});
