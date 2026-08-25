export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type AuthSessionResponse =
  | { authenticated: false; user: null }
  | { authenticated: true; user: AuthUser };

export type AuthErrorCode =
  | "auth_not_configured"
  | "callback_failed"
  | "invalid_request"
  | "login_failed"
  | "logout_failed"
  | "provider_denied"
  | "session_unavailable";
