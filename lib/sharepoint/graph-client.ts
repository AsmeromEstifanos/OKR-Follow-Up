import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value && value.trim().length > 0))?.trim();
}

export function getConfiguredSharePointSiteUrl(): string {
  return (
    firstNonEmpty(process.env.NEXT_PUBLIC_SHAREPOINT_SITE_URL, process.env.REACT_APP_SHAREPOINT_SITE_URL) ?? ""
  );
}

function getDefaultAccount(instance: IPublicClientApplication): AccountInfo | null {
  const current = instance.getActiveAccount();
  if (current) {
    return current;
  }

  const first = instance.getAllAccounts()[0] ?? null;
  if (first) {
    instance.setActiveAccount(first);
  }

  return first;
}

export async function acquireGraphTokenSilent(
  instance: IPublicClientApplication,
  scopes: string[],
  account?: AccountInfo | null
): Promise<string> {
  const resolvedAccount = account ?? getDefaultAccount(instance);
  if (!resolvedAccount) {
    throw new Error("No authenticated account available.");
  }

  try {
    const response = await instance.acquireTokenSilent({
      scopes,
      account: resolvedAccount
    });

    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      throw new Error("Authentication required. Please sign in again.");
    }

    throw error instanceof Error ? error : new Error("Failed to acquire Graph token.");
  }
}

function buildSiteIdentifierFromUrl(siteUrl: string): string {
  const parsed = new URL(siteUrl);
  const pathname = parsed.pathname || "/";
  return `${parsed.hostname}:${pathname}`;
}

type GraphSiteResponse = {
  id: string;
  displayName?: string;
  webUrl?: string;
};

export async function probeSharePointSiteConnection(
  instance: IPublicClientApplication,
  siteUrl: string,
  scopes: string[]
): Promise<GraphSiteResponse> {
  const token = await acquireGraphTokenSilent(instance, scopes);
  const siteIdentifier = buildSiteIdentifierFromUrl(siteUrl);
  const response = await fetch(`${GRAPH_BASE_URL}/sites/${siteIdentifier}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SharePoint probe failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  return (await response.json()) as GraphSiteResponse;
}
