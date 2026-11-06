import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],test:{environment:'jsdom',include:['scripts/distribution/*.ui.test.jsx'],testTimeout:30000,hookTimeout:30000,pool:'forks',poolOptions:{forks:{singleFork:true}}}});
