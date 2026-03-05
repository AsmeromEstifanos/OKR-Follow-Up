import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GraphTokenResponse = {
  access_token: string;
  expires_in: number;
};

type GraphUser = {
  accountEnabled?: boolean;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

type GraphUsersResponse = {
  value?: GraphUser[];
  "@odata.nextLink"?: string;
};

type UserSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
};

const cache = globalThis as {
  __okrUsersGraphToken?: {
    value: string;
    expiresAt: number;
  };
  __okrTenantUsers?: {
    value: UserSuggestion[];
    expiresAt: number;
  };
};

function isDummyOwnerValue(value: string): boolean {
  return value.toLowerCase().includes("@contoso");
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function getAppCredentials(): { tenantId: string; clientId: string; clientSecret: string } {
  return {
    tenantId: firstNonEmpty(
      process.env.AZURE_APP_TENANT_ID,
      process.env.AZURE_TENANT_ID,
      process.env.NEXT_PUBLIC_AAD_TENANT_ID,
      process.env.REACT_APP_AAD_TENANT_ID
    ),
    clientId: firstNonEmpty(
      process.env.AZURE_APP_CLIENT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.NEXT_PUBLIC_AZURE_CLIENT_ID,
      process.env.REACT_APP_AZURE_CLIENT_ID
    ),
    clientSecret: firstNonEmpty(process.env.AZURE_APP_CLIENT_SECRET, process.env.AZURE_CLIENT_SECRET)
  };
}

async function acquireGraphAppToken(): Promise<string> {
  const cached = cache.__okrUsersGraphToken;
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.value;
  }

  const { tenantId, clientId, clientSecret } = getAppCredentials();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Azure app credentials are not configured for tenant user suggestions.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default"
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to acquire Graph token: ${response.status} ${response.statusText} ${message}`);
  }

  const payload = (await response.json()) as GraphTokenResponse;
  cache.__okrUsersGraphToken = {
    value: payload.access_token,
    expiresAt: now + Math.max(120, payload.expires_in) * 1000
  };

  return payload.access_token;
}

async function fetchTenantUsers(): Promise<UserSuggestion[]> {
  const cached = cache.__okrTenantUsers;
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const token = await acquireGraphAppToken();
  const users: UserSuggestion[] = [];
  let nextUrl = "https://graph.microsoft.com/v1.0/users?$select=displayName,mail,userPrincipalName,accountEnabled&$top=999";
  let pageCount = 0;

  while (nextUrl && pageCount < 5) {
    const response = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Fetch tenant users failed: ${response.status} ${response.statusText} ${message}`);
    }

    const payload = (await response.json()) as GraphUsersResponse;
    const pageUsers = payload.value ?? [];

    pageUsers.forEach((user) => {
      if (user.accountEnabled === false) {
        return;
      }

      const principalName = firstNonEmpty(user.userPrincipalName, user.mail);
      if (!principalName) {
        return;
      }

      users.push({
        displayName: firstNonEmpty(user.displayName, principalName),
        principalName,
        mail: firstNonEmpty(user.mail, principalName)
      });
    });

    nextUrl = payload["@odata.nextLink"] ?? "";
    pageCount += 1;
  }

  const deduped = Array.from(
    new Map(users.map((entry) => [entry.principalName.toLowerCase(), entry])).values()
  ).sort((left, right) => left.displayName.localeCompare(right.displayName));

  cache.__okrTenantUsers = {
    value: deduped,
    expiresAt: now + 5 * 60 * 1000
  };

  return deduped;
}

function mergeSuggestions(...groups: UserSuggestion[][]): UserSuggestion[] {
  const merged = new Map<string, UserSuggestion>();
  groups.flat().forEach((entry) => {
    if (isDummyOwnerValue(entry.principalName) || isDummyOwnerValue(entry.mail) || isDummyOwnerValue(entry.displayName)) {
      return;
    }

    const key = entry.principalName.toLowerCase();
    if (!key) {
      return;
    }

    if (!merged.has(key)) {
      merged.set(key, entry);
    }
  });

  return Array.from(merged.values()).sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const includeAll = request.nextUrl.searchParams.get("all") === "1";

  try {
    const users = await fetchTenantUsers();
    const catalog = mergeSuggestions(users);
    const filtered = query
      ? catalog.filter((user) => {
          return (
            user.displayName.toLowerCase().includes(query) ||
            user.principalName.toLowerCase().includes(query) ||
            user.mail.toLowerCase().includes(query)
          );
        })
      : catalog;

    return NextResponse.json(includeAll ? filtered : filtered.slice(0, 20));
  } catch {
    const cachedUsers = cache.__okrTenantUsers?.value ?? [];
    const catalog = mergeSuggestions(cachedUsers);
    const filtered = query
      ? catalog.filter((user) => {
          return (
            user.displayName.toLowerCase().includes(query) ||
            user.principalName.toLowerCase().includes(query) ||
            user.mail.toLowerCase().includes(query)
          );
        })
      : catalog;

    return NextResponse.json(includeAll ? filtered : filtered.slice(0, 20));
  }
}
