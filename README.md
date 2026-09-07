# 🎓 AlumniConnect — College Alumni Network App

A mobile-first web app for managing your college's alumni directory.  
No servers to manage. No installation required. Just open in a browser!

---

## 📁 Project Structure

```
alumni-connect/
├── index.html              ← Main app (open this in browser)
├── css/
│   └── styles.css          ← All styling
├── js/
│   ├── firebase-config.js  ← ⚠️ YOU MUST EDIT THIS FILE
│   ├── app.js              ← App logic & alumni CRUD
│   └── auth.js             ← Login / Register / Logout
└── README.md               ← This file
```

---

## 🚀 Setup Guide (Step by Step)

### STEP 1 — Create a Free Firebase Project

1. Go to **https://console.firebase.google.com/**
2. Click **"Add project"** → give it a name like `alumni-connect`
3. Disable Google Analytics (optional) → Click **"Create project"**

---

### STEP 2 — Enable Authentication

1. In Firebase Console → click **Authentication** (left sidebar)
2. Click **"Get started"**
3. Under "Sign-in providers" → click **Email/Password**
4. Toggle **Enable** → click **Save**

---

### STEP 3 — Create Firestore Database

1. In Firebase Console → click **Firestore Database** (left sidebar)
2. Click **"Create database"**
3. Choose **"Start in test mode"** (for development) → click **Next**
4. Pick a location close to India (e.g., `asia-south1`) → click **Enable**

---

### STEP 4 — Get Your Firebase Config

1. In Firebase Console → click the **gear icon ⚙️** → **Project settings**
2. Scroll down to **"Your apps"** section
3. Click the **Web icon `</>`**
4. Register your app (any name) → click **"Register app"**
5. You'll see a block like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. **Open `js/firebase-config.js`** in VS Code
7. **Replace the placeholder values** with your actual values

---

### STEP 5 — Create Your Admin Account

1. In Firebase Console → **Authentication** → **Users** → **Add user**
2. Enter your email and a password → click **Add user**
3. Copy the **UID** shown next to this user

4. In Firebase Console → **Firestore Database** → **Start collection**
   - Collection ID: `admins`
   - Document ID: paste the **UID** you copied
   - Add a field: `name` (string) = `Your Name`
   - Add a field: `role` (string) = `admin`
   - Click **Save**

Now this email/password is your **Admin / Coordinator login**.

---

### STEP 6 — Set Firestore Security Rules

In Firebase Console → **Firestore Database** → **Rules** tab → paste this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anyone logged in can read alumni
    match /alumni/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        exists(/databases/$(database)/documents/admins/$(request.auth.uid));
      // Students can write their own profile only
      allow create: if request.auth != null && request.auth.uid == doc;
      allow update: if request.auth != null && request.auth.uid == doc;
    }
    // Only admins can read admins collection
    match /admins/{doc} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

Click **Publish**.

---

### STEP 7 — Open the App in VS Code

1. Open VS Code
2. **File → Open Folder** → select the `alumni-connect` folder
3. Install the **"Live Server"** extension (search in Extensions panel)
4. Right-click `index.html` → **"Open with Live Server"**
5. App opens at `http://127.0.0.1:5500` 🎉

---

## 🌐 Deploy to GitHub Pages (Share with Anyone!)

### Push to GitHub:
```bash
# In VS Code terminal (Ctrl + `)
git init
git add .
git commit -m "Initial commit - AlumniConnect app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/alumni-connect.git
git push -u origin main
```

### Enable GitHub Pages:
1. Go to your GitHub repo → **Settings** → **Pages**
2. Under "Source" → select **main** branch → **/ (root)** → click **Save**
3. Your app is live at: `https://YOUR_USERNAME.github.io/alumni-connect/`

**Share this link with anyone** — opens on mobile, no install needed! 📱

---

## 👤 User Roles & Clearances

| Role | Login / Auth | Key Privileges |
|------|--------------|----------------|
| **Admin / Coordinator** | Email + Password | Review & 1-click publish alumni referrals, post job/internship vacancies, manage official events, add/delete alumni |
| **Alumni** | Email / USN + Password | Direct 1-on-1 communication channel with College Coordinator, refer hiring leads & job/internship openings, track referral status |
| **Student** | Email / USN + Password | Browse verified vacancies & apply, network with alumni, view events timeline |

---

## 📱 Features

- ✅ **Exclusive Alumni-to-Coordinator Channel**: Verified alumni can directly communicate with the college placement coordinator to share job vacancies, internship referrals, and institutional notices
- ✅ **Alumni Opportunity Submission Engine**: Alumni can submit company openings with salary/stipend, eligibility, referral notes, and application URLs
- ✅ **Coordinator Review & 1-Click Publishing**: Coordinator reviews incoming alumni referrals with 1-click publishing directly to the student Opportunities Hub
- ✅ **24-Hour Disappearing Peer Messaging**: Real-time direct chat with unread indicators and quick preset referral chips
- ✅ **College Events Noticeboard**: Image lightbox banners and official notifications
- ✅ **Real-time Directory & Filters**: Branch, year, and smart query search
- ✅ **Mobile-first Responsive Design**: Glassmorphic modern aesthetic optimized for all screen sizes

---

## ❓ Common Questions

**Q: Do I need to install Node.js or npm?**  
No! This app uses plain HTML/CSS/JS. Just open in a browser.

**Q: Where is data stored?**  
In Firebase Firestore (Google's free cloud database). All your friends see the same data in real time.

**Q: How many alumni can I store for free?**  
Firebase free tier allows 1GB storage and 50,000 reads/day — more than enough.

**Q: Can I use this without internet?**  
No, Firebase requires internet. But it works on any mobile browser with internet.

---

*Built with ❤️ using plain HTML, CSS, JS + Firebase*
