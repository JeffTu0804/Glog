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
import { getSupabaseClient, hotelSupabase, managerSupabase } from "../lib/supabase";
import type { User } from "../types/api";
import type { PlatformAdmin } from "../types/platform";

import type { LoginTarget } from "../types/auth";
export type { LoginTarget } from "../types/auth";

interface AuthContextValue {
  hotelSession: Session | null;
  managerSession: Session | null;
  profile: User | null;
  platformAdmin: PlatformAdmin | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string, target: LoginTarget) => Promise<LoginTarget>;
  logout: (target: LoginTarget) => Promise<void>;
  getToken: (target?: LoginTarget) => Promise<string>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function inferLoginTarget(pathname = window.location.pathname): LoginTarget {
  return pathname.startsWith("/manager") ? "platform" : "hotel";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hotelSession, setHotelSession] = useState<Session | null>(null);
  const [managerSession, setManagerSession] = useState<Session | null>(null);
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

  useEffect(() => {
    let active = true;

    async function init() {
      const [hotelRes, managerRes] = await Promise.all([
        hotelSupabase.auth.getSession(),
        managerSupabase.auth.getSession(),
      ]);

      if (!active) return;

      setHotelSession(hotelRes.data.session);
      setManagerSession(managerRes.data.session);

      await Promise.all([
        hotelRes.data.session
          ? loadHotelIdentity(hotelRes.data.session.access_token)
          : Promise.resolve(setProfile(null)),
        managerRes.data.session
          ? loadManagerIdentity(managerRes.data.session.access_token)
          : Promise.resolve(setPlatformAdmin(null)),
      ]);

      if (active) setLoading(false);
    }

    void init();

    const { data: hotelSub } = hotelSupabase.auth.onAuthStateChange((_event, session) => {
      setHotelSession(session);
      if (session) {
        void loadHotelIdentity(session.access_token);
      } else {
        setProfile(null);
      }
    });

    const { data: managerSub } = managerSupabase.auth.onAuthStateChange((_event, session) => {
      setManagerSession(session);
      if (session) {
        void loadManagerIdentity(session.access_token);
      } else {
        setPlatformAdmin(null);
      }
    });

    return () => {
      active = false;
      hotelSub.subscription.unsubscribe();
      managerSub.subscription.unsubscribe();
    };
  }, [loadHotelIdentity, loadManagerIdentity]);

  const login = useCallback(
    async (email: string, password: string, target: LoginTarget) => {
      const client = getSupabaseClient(target);
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error("登入失敗");

      if (target === "platform") {
        try {
          await platformApi.getMe(data.session.access_token);
        } catch (err) {
          await client.auth.signOut();
          throw err;
        }
      }

      return target;
    },
    [],
  );

  const logout = useCallback(async (target: LoginTarget) => {
    await getSupabaseClient(target).auth.signOut();
  }, []);

  const getToken = useCallback(async (target?: LoginTarget) => {
    const portal = target ?? inferLoginTarget();
    const { data } = await getSupabaseClient(portal).auth.getSession();
    if (!data.session) throw new Error("未登入");
    return data.session.access_token;
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
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return ctx;
}
