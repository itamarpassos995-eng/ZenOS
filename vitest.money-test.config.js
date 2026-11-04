import { mergeConfig } from 'vitest/config';
import config from './vite.money-test.config.js';
export default mergeConfig(config,{root:process.cwd(),test:{include:['scripts/recovery/money-integration.ui.test.jsx'],environment:'jsdom',pool:'forks',poolOptions:{forks:{singleFork:true}},testTimeout:20000}});
