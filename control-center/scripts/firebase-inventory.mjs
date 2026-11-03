// Read-only Firebase Admin inventory. Explicit collection path required: never guess a tenant collection.
// Run only in isolated homologation after granting a restricted service account.
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
const projectId=process.env.FIREBASE_PROJECT_ID;
const collectionPath=process.env.CONTROL_CENTER_ORG_COLLECTION;
const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if(!projectId||!collectionPath||!raw)throw Error('MISSING_READONLY_FIREBASE_CONFIGURATION');
if(!/^[a-zA-Z0-9_-]+$/.test(collectionPath))throw Error('INVALID_TOP_LEVEL_COLLECTION');
const credential=JSON.parse(raw);
if(credential.project_id!==projectId)throw Error('FIREBASE_PROJECT_MISMATCH');
const app=initializeApp({credential:cert(credential),projectId},'control-center-inventory');
const db=getFirestore(app);
const count=await db.collection(collectionPath).count().get();
console.log(JSON.stringify({mode:'read-only-inventory',collection:collectionPath,documents:count.data().count,imported:0}));
await deleteApp(app);
