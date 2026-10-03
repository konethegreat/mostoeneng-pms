import { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, getToken } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const { user } = await api.get("/auth/me");
          setUser(user);
        } catch {
          setToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email, password) {
    const { token, user } = await api.post("/auth/login", { email, password });
    setToken(token);
    setUser(user);
    return user;
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
