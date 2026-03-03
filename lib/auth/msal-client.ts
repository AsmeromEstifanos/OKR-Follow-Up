import { type AccountInfo, type PopupRequest, PublicClientApplication } from "@azure/msal-browser";

const DEFAULT_CLIENT_ID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_AUTHORITY = "https://login.microsoftonline.com/common";
const DEFAULT_SCOPES = ["openid", "profile", "email", "User.Read", "Sites.Read.All"];

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value && value.trim().length > 0))?.trim();
}

function parseScopes(value: string | undefined): string[] {
  if (!value) {
    return DEFAULT_SCOPES;
  }

  const parts = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : DEFAULT_SCOPES;
}

const envClientId = firstNonEmpty(
  process.env.NEXT_PUBLIC_AZURE_CLIENT_ID,
  process.env.REACT_APP_AZURE_CLIENT_ID,
  process.env.NEXT_PUBLIC_AAD_CLIENT_ID,
  process.env.REACT_APP_AAD_CLIENT_ID,
  process.env.NEXT_PUBLIC_CLIENT_ID,
  process.env.REACT_APP_CLIENT_ID
);

const envAuthority = firstNonEmpty(
  process.env.NEXT_PUBLIC_AZURE_AUTHORITY,
  process.env.REACT_APP_AZURE_AUTHORITY,
  process.env.NEXT_PUBLIC_AAD_AUTHORITY,
  process.env.REACT_APP_AAD_AUTHORITY
);

const envTenant = firstNonEmpty(
  process.env.NEXT_PUBLIC_AAD_TENANT_ID,
  process.env.REACT_APP_AAD_TENANT_ID,
  process.env.NEXT_PUBLIC_TENANT_ID,
  process.env.REACT_APP_TENANT_ID,
  process.env.NEXT_PUBLIC_AAD_TENANT_DOMAIN,
  process.env.REACT_APP_AAD_TENANT_DOMAIN
);

const authority = envAuthority ?? (envTenant ? `https://login.microsoftonline.com/${envTenant}` : DEFAULT_AUTHORITY);
const redirectUri =
  firstNonEmpty(process.env.NEXT_PUBLIC_REDIRECT_URI, process.env.REACT_APP_REDIRECT_URI) ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
const postLogoutRedirectUri =
  firstNonEmpty(process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI, process.env.REACT_APP_POST_LOGOUT_REDIRECT_URI) ??
  redirectUri;

const loginScopes = parseScopes(
  firstNonEmpty(process.env.NEXT_PUBLIC_LOGIN_SCOPES, process.env.REACT_APP_LOGIN_SCOPES)
);

export const msalConfigError = envClientId
  ? ""
  : "Missing Azure client ID. Set NEXT_PUBLIC_AZURE_CLIENT_ID (or REACT_APP_AZURE_CLIENT_ID).";

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: envClientId ?? DEFAULT_CLIENT_ID,
    authority,
    redirectUri,
    postLogoutRedirectUri
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true
  }
});

let msalInitPromise: Promise<void> | null = null;

export function initializeMsal(): Promise<void> {
  if (!msalInitPromise) {
    msalInitPromise = msalInstance.initialize();
  }

  return msalInitPromise;
}

export function ensureActiveAccount(): AccountInfo | null {
  const current = msalInstance.getActiveAccount();
  if (current) {
    return current;
  }

  const accounts = msalInstance.getAllAccounts();
  const first = accounts[0] ?? null;
  if (first) {
    msalInstance.setActiveAccount(first);
  }

  return first;
}

export const loginRequest: PopupRequest = {
  scopes: loginScopes
};

export const sharePointProbeScopes = ["Sites.Read.All"];
