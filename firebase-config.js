// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAgZQUPTMYU2bjkH0QhZbtTG6RxV7Z0PVM",
  authDomain: "virtualchoir-28f87.firebaseapp.com",
  databaseURL: "https://virtualchoir-28f87-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "virtualchoir-28f87",
  storageBucket: "virtualchoir-28f87.firebasestorage.app",
  messagingSenderId: "862276991613",
  appId: "1:862276991613:web:1c95aea04c92a309fc8f14",
  measurementId: "G-JBF4C4RPGD"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

