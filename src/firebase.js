import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA3vwT5sqlnynxZBgWsU_sIECqjbz3BpUo",
  authDomain: "zenos-ac6b2.firebaseapp.com",
  projectId: "zenos-ac6b2",
  storageBucket: "zenos-ac6b2.firebasestorage.app",
  messagingSenderId: "411148782192",
  appId: "1:411148782192:web:e70d6c634ca1c86c6102b5",
  measurementId: "G-EDEHGJFQHH"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const analytics = getAnalytics(app);