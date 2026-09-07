// ============================================================
//  STEP 1: Replace these values with YOUR Firebase project config
//  How to get this: https://console.firebase.google.com/
//  → Create project → Web app → Copy config below
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyCyxsW1Pgkz1FrFy297Aen8BTHumR62kNs",
  authDomain: "alumini-connect-710f7.firebaseapp.com",
  projectId: "alumini-connect-710f7",
  storageBucket: "alumini-connect-710f7.firebasestorage.app",
  messagingSenderId: "14715910450",
  appId: "1:14715910450:web:05aeae474902695bdb3f2b",
};

// Initialize Firebase safely
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();
