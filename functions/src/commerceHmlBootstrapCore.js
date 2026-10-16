import {ambienteMidiaCommercePronto} from './commerceStorageSafetyCore.js';
export const bootstrapCommercePermitido=(env,auth)=>env.GCLOUD_PROJECT==='zenos-commerce-homologacao'&&ambienteMidiaCommercePronto(env)&&Boolean(auth?.uid)&&auth.token?.email_verified===true&&auth.token?.email==='itamarbenit@gmail.com'&&auth.token?.firebase?.sign_in_provider==='google.com';
