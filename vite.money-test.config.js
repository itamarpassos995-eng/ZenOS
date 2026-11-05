import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
const root = process.cwd();
const disabled = resolve(root,'src/homologacao/firebaseDisabled.js');
export default defineConfig({
  root:resolve(root,'homologacao'), publicDir:false, plugins:[{
    name:'money-test-disable-real-transports',enforce:'pre',
    resolveId(source,importer){
      if(!importer||!source.startsWith('.'))return;
      const path=resolve(dirname(importer.split('?')[0]),source).replace(/\.(js|jsx)$/,'');
      if(path===resolve(root,'src/firebase')||path===resolve(root,'src/core/runtimeEnvironment'))return disabled;
    },
    generateBundle(_,bundle){
      for(const asset of Object.values(bundle))if(asset.type==='chunk'&&/zenos-ac6b2|411148782192|VITE_ZENOS_PRIVATE_ORDERS_ENABLED/.test(asset.code))
        throw Error('Isolamento falhou: configuração de produção encontrada no bundle de teste.');
      this.emitFile({type:'asset',fileName:'logo-zenos.png',source:readFileSync(resolve(root,'public/logo-zenos.png'))});
    },
  },react()],
  build:{outDir:resolve(root,'homologacao/dist'),emptyOutDir:true,rollupOptions:{input:resolve(root,'homologacao/index.html')}},
});
