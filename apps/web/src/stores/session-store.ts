import { create } from 'zustand';
import type { AuthUserDto, LoginResponseDto } from '@land/shared';

const STORAGE_KEY = 'land_dashboard_session_v1';

function readStoredSession(): LoginResponseDto | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoginResponseDto;
    if (parsed && typeof parsed.accessToken === 'string' && parsed.user) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

interface SessionState {
  session: LoginResponseDto | null;
  setSession: (next: LoginResponseDto | null) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: typeof window !== 'undefined' ? readStoredSession() : null,
  setSession: (next) => {
    try {
      if (next) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
    set({ session: next });
  },
  clearSession: () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ session: null });
  },
}));

export function getSession(): LoginResponseDto | null {
  return useSessionStore.getState().session;
}

export function setSession(next: LoginResponseDto | null): void {
  useSessionStore.getState().setSession(next);
}

export function getCurrentUser(): AuthUserDto | null {
  return useSessionStore.getState().session?.user ?? null;
}
