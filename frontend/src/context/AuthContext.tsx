import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { api } from "../lib/api";
import { platformApi } from "../lib/platformApi";
import { supabase } from "../lib/supabase";
import type { User } from "../types/api";
import type { PlatformAdmin } from "../types/platform";

export type LoginTarget = "hotel" | "platform";

interface AuthContextValue {
  session: Session | null;
  profile: User | null;
  platformAdmin: PlatformAdmin | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string, target: LoginTarget) => Promise<LoginTarget>;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveIdentity(accessToken: string, target: LoginTarget) {
  if (target === "platform") {
    const { admin } = await platformApi.getMe(accessToken);
    return { platformAdmin: admin, profile: null as User | null };
  }

  const { user } = await api.getMe(accessToken);
  return { platformAdmin: null as PlatformAdmin | null, profile: user };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  const clearIdentity = useCallback(() => {
    setProfile(null);
    setPlatformAdmin(null);
  }, []);

  const loadIdentity = useCallback(
    async (accessToken: string, preferredTarget?: LoginTarget) => {
      if (preferredTarget) {
        const identity = await resolveIdentity(accessToken, preferredTarget);
        setProfile(identity.profile);
        setPlatformAdmin(identity.platformAdmin);
        return preferredTarget;
      }

      try {
        const { admin } = await platformApi.getMe(accessToken);
        setPlatformAdmin(admin);
        setProfile(null);
        return "platform" as const;
      } catch {
        const { user } = await api.getMe(accessToken);
        setProfile(user);
        setPlatformAdmin(null);
        return "hotel" as const;
      }
    },
    [],
  );

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        void loadIdentity(data.session.access_token).finally(() =>
          setLoading(false),
        );
      } else {
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession) {
          void loadIdentity(nextSession.access_token);
        } else {
          clearIdentity();
        }
      },
    );

    return () => subscription.subscription.unsubscribe();
  }, [loadIdentity, clearIdentity]);

  const login = useCallback(
    async (email: string, password: string, target: LoginTarget) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error("登入失敗");
      return loadIdentity(data.session.access_token, target);
    },
    [loadIdentity],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearIdentity();
  }, [clearIdentity]);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("未登入");
    return data.session.access_token;
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = await getToken();
    await loadIdentity(token, platformAdmin ? "platform" : "hotel");
  }, [getToken, loadIdentity, platformAdmin]);

  const value = useMemo(
    () => ({
      session,
      profile,
      platformAdmin,
      isPlatformAdmin: platformAdmin !== null,
      loading,
      login,
      logout,
      getToken,
      refreshProfile,
    }),
    [
      session,
      profile,
      platformAdmin,
      loading,
      login,
      logout,
      getToken,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return ctx;
}
