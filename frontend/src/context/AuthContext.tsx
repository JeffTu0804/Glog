import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { platformApi } from "../lib/platformApi";
import {
  clearSession,
  getApiBase,
  readSession,
  writeSession,
  type AuthSession,
} from "../lib/session";
import type { User } from "../types/api";
import type { PlatformAdmin } from "../types/platform";

import type { LoginTarget } from "../types/auth";
export type { LoginTarget } from "../types/auth";

interface AuthContextValue {
  hotelSession: AuthSession | null;
  managerSession: AuthSession | null;
  profile: User | null;
  platformAdmin: PlatformAdmin | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string, target: LoginTarget) => Promise<LoginTarget>;
  logout: (target: LoginTarget) => Promise<void>;
  getToken: (target?: LoginTarget) => Promise<string>;
  refreshProfile: () => Promise<void>;
  setSessionFromToken: (
    target: LoginTarget,
    token: string,
    user?: AuthSession["user"],
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function inferLoginTarget(pathname = window.location.pathname): LoginTarget {
  return pathname.startsWith("/manager") ? "platform" : "hotel";
}

async function parseApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error || body.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hotelSession, setHotelSession] = useState<AuthSession | null>(null);
  const [managerSession, setManagerSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHotelIdentity = useCallback(async (accessToken: string) => {
    try {
      const { user } = await api.getMe(accessToken);
      setProfile(user);
    } catch {
      setProfile(null);
    }
  }, []);

  const loadManagerIdentity = useCallback(async (accessToken: string) => {
    try {
      const { admin } = await platformApi.getMe(accessToken);
      setPlatformAdmin(admin);
    } catch {
      setPlatformAdmin(null);
    }
  }, []);

  const hydrate = useCallback(async () => {
    const hotel = readSession("hotel");
    const manager = readSession("platform");
    setHotelSession(hotel);
    setManagerSession(manager);

    await Promise.all([
      hotel
        ? loadHotelIdentity(hotel.access_token)
        : Promise.resolve(setProfile(null)),
      manager
        ? loadManagerIdentity(manager.access_token)
        : Promise.resolve(setPlatformAdmin(null)),
    ]);
  }, [loadHotelIdentity, loadManagerIdentity]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await hydrate();
      if (active) setLoading(false);
    })();

    const onChange = () => {
      void hydrate();
    };
    window.addEventListener("glog-auth-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      active = false;
      window.removeEventListener("glog-auth-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [hydrate]);

  const setSessionFromToken = useCallback(
    async (
      target: LoginTarget,
      token: string,
      user?: AuthSession["user"],
    ) => {
      const session: AuthSession = {
        access_token: token,
        user: user ?? { id: "", email: "", name: "" },
      };
      writeSession(target, session);
      if (target === "platform") {
        setManagerSession(session);
        await loadManagerIdentity(token);
      } else {
        setHotelSession(session);
        await loadHotelIdentity(token);
      }
    },
    [loadHotelIdentity, loadManagerIdentity],
  );

  const login = useCallback(
    async (email: string, password: string, target: LoginTarget) => {
      const res = await fetch(`${getApiBase()}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, target }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = (await res.json()) as {
        token: string;
        account: { id: string; email: string; name: string };
      };

      await setSessionFromToken(target, data.token, {
        id: data.account.id,
        email: data.account.email,
        name: data.account.name,
      });

      if (target === "platform") {
        try {
          await platformApi.getMe(data.token);
        } catch (err) {
          clearSession(target);
          setManagerSession(null);
          setPlatformAdmin(null);
          throw err;
        }
      }

      return target;
    },
    [setSessionFromToken],
  );

  const logout = useCallback(async (target: LoginTarget) => {
    clearSession(target);
    if (target === "platform") {
      setManagerSession(null);
      setPlatformAdmin(null);
    } else {
      setHotelSession(null);
      setProfile(null);
    }
  }, []);

  const getToken = useCallback(async (target?: LoginTarget) => {
    const portal = target ?? inferLoginTarget();
    const session = readSession(portal);
    if (!session) throw new Error("未登入");
    return session.access_token;
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = await getToken("hotel");
    await loadHotelIdentity(token);
  }, [getToken, loadHotelIdentity]);

  const value = useMemo(
    () => ({
      hotelSession,
      managerSession,
      profile,
      platformAdmin,
      isPlatformAdmin: platformAdmin !== null,
      loading,
      login,
      logout,
      getToken,
      refreshProfile,
      setSessionFromToken,
    }),
    [
      hotelSession,
      managerSession,
      profile,
      platformAdmin,
      loading,
      login,
      logout,
      getToken,
      refreshProfile,
      setSessionFromToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return ctx;
}
