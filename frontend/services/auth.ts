import { BASE_URL } from "./apiBase";

const AUTH_URL = BASE_URL;

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface UserInfo {
  id: string;
  email: string;
  is_active: boolean;
  is_verified: boolean;
  is_superuser: boolean;
  display_name?: string | null;
}

export const authApi = {
  login: async (email: string, password: string): Promise<AuthTokens> => {
    const body = new URLSearchParams();
    body.append("username", email);
    body.append("password", password);

    const res = await fetch(`${AUTH_URL}/api/auth/jwt/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail: string = data.detail ?? "Login failed";
      if (detail === "LOGIN_USER_NOT_VERIFIED") {
        throw new Error(
          "Your email has not been verified. Please enter the 6-digit code sent to your .mil inbox."
        );
      }
      if (detail === "LOGIN_BAD_CREDENTIALS") {
        throw new Error("Invalid email or password.");
      }
      throw new Error(detail);
    }

    return res.json();
  },

  register: async (email: string, password: string): Promise<UserInfo> => {
    const res = await fetch(`${AUTH_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail = data.detail;

      if (detail === "REGISTER_USER_ALREADY_EXISTS") {
        throw new Error("An account with that email already exists.");
      }
      // Pydantic validation error (e.g. not a .mil address)
      if (Array.isArray(detail)) {
        const msg = detail[0]?.msg ?? "Registration failed";
        throw new Error(msg);
      }
      throw new Error(typeof detail === "string" ? detail : "Registration failed");
    }

    return res.json();
  },

  verifyEmailCode: async (email: string, code: string): Promise<void> => {
    const res = await fetch(`${AUTH_URL}/api/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail: string = data.detail ?? "Verification failed";
      if (detail === "VERIFY_CODE_EXPIRED") {
        throw new Error("This verification code has expired. Please register again.");
      }
      if (detail === "VERIFY_CODE_INVALID") {
        throw new Error("Invalid verification code. Please check your email and try again.");
      }
      throw new Error(detail);
    }
  },

  forgotPassword: async (email: string): Promise<void> => {
    await fetch(`${AUTH_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    // Always succeeds silently (prevents email enumeration)
  },

  resetPassword: async (token: string, password: string): Promise<void> => {
    const res = await fetch(`${AUTH_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? "Password reset failed");
    }
  },

  getMe: async (token: string): Promise<UserInfo> => {
    const res = await fetch(`${AUTH_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch user info");
    return res.json();
  },

  updateMe: async (
    token: string,
    data: { display_name?: string }
  ): Promise<UserInfo> => {
    const res = await fetch(`${AUTH_URL}/api/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update profile");
    return res.json();
  },
};
