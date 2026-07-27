# MVP Authentication Rules

- Production vendor identity must come from Firebase Authentication.
- Google sign-in failures must leave the user unauthenticated and display an error.
- The application must restore and monitor Firebase sessions with `onAuthStateChanged`.
- An authenticated vendor identity requires both a Firebase UID and email address.
- Vendor sign-out must call Firebase `signOut` and clear the active application session.
- A Firebase-authenticated user without a vendor profile must continue to onboarding.
- Email addresses must not grant automatic access or trigger automatic vendor provisioning.
- Demo personas are development-only and require `VITE_ENABLE_DEMO_LOGIN=true`.
- Demo personas must never be available in a production build, even if the flag is set.
