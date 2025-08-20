// src/context/AuthContext.jsx
import { createContext, useContext, useMemo, useState, useEffect } from "react";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { app } from "@/utils/firebaseConfig"; // make sure 'app' is exported

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);      // Firebase user (anonymous or real)
  const [user, setUser] = useState(null);          // Your app user (roles/profile), optional
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const auth = getAuth(app);

    // Persist session so anonymous user survives refresh/offline
    setPersistence(auth, browserLocalPersistence).then(() => {
      const unsub = onAuthStateChanged(auth, async (u) => {
        if (!u) {
          try {
            await signInAnonymously(auth); // must succeed once while online
          } catch (e) {
            console.error("Anonymous sign-in failed:", e);
          }
          return; // wait for next state change where u will exist
        }
        setFbUser(u);

        // OPTIONAL: map Firebase user -> your app user/roles later
        // setUser(await fetchMyProfileOrClaims(u));

        setIsAuthReady(true);
      });
      return () => unsub();
    });
  }, []);

  // Demo login/logout still supported for your app-level identity if you keep them
  const login = async (email, _password) => setUser({ id: "U1", email, role: "Admin" });
  const logout = async () => setUser(null);

  const value = useMemo(
    () => ({ fbUser, user, login, logout, isAuthReady }),
    [fbUser, user, isAuthReady]
  );

  // Gate children until Firebase auth is ready to avoid permission-denied on first renders
  if (!isAuthReady) return null; // or a spinner

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
