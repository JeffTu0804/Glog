import type { LoginTarget } from "../types/auth";

export interface AuthSession {
  access_token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

const HOTEL_KEY = "glog-hotel-auth";
const MANAGER_KEY = "glog-manager-auth";

function storageKey(target: LoginTarget): string {
  return target === "platform" ? MANAGER_KEY : HOTEL_KEY;
}

export function readSession(target: LoginTarget): AuthSession | null {
  try {
    const raw = localStorage.getItem(storageKey(target));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.access_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(target: LoginTarget, session: AuthSession): void {
  localStorage.setItem(storageKey(target), JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("glog-auth-change", { detail: { target } }));
}

export function clearSession(target: LoginTarget): void {
  localStorage.removeItem(storageKey(target));
  window.dispatchEvent(new CustomEvent("glog-auth-change", { detail: { target } }));
}

export function getApiBase(): string {
  return (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    ""
  );
}
