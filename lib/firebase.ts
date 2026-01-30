
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBEA1UdogU_J1ejn9Epc70sGtK83Is-RC0",
  authDomain: "sistema-catalogo-digitales.firebaseapp.com",
  projectId: "sistema-catalogo-digitales",
  storageBucket: "sistema-catalogo-digitales.firebasestorage.app",
  messagingSenderId: "17708321027",
  appId: "1:17708321027:web:f6d89869681289638bc136",
  measurementId: "G-MJ7H878WHC"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize and Export Services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
export default app;
