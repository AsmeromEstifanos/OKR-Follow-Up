# OKR Follow-Up Auth Flow

This app uses a hybrid permission model:

- `Delegated` permissions in the browser for sign-in and the SharePoint site connectivity probe
- `Application` permissions on the server for Graph-backed SharePoint storage and tenant user suggestions

## Mermaid Diagram

```mermaid
flowchart TB
  subgraph B["Browser / User Context"]
    U["User"]
    UI["OKR Follow-Up UI"]
    MSAL["MSAL PublicClientApplication"]
  end

  subgraph D["Delegated Permission Flow"]
    DS["Scopes: openid, profile, email, User.Read, Sites.Read.All"]
    DT["User access token"]
    DG["Microsoft Graph"]
    DP["SharePoint site probe only"]
  end

  subgraph S["Server / Backend Context"]
    API["Next.js API routes"]
    ENV["Tenant ID + Client ID + Client Secret"]
  end

  subgraph A["Application Permission Flow"]
    AT["client_credentials + /.default"]
    AA["App-only access token"]
    AG["Microsoft Graph"]
    AP["SharePoint storage + user suggestions"]
  end

  U --> UI
  UI --> MSAL
  MSAL --> DS
  DS --> DT
  DT --> DG
  DG --> DP

  UI --> API
  API --> ENV
  ENV --> AT
  AT --> AA
  AA --> AG
  AG --> AP
```

## Short Explanation

### Delegated

The signed-in user authenticates in the browser through MSAL. The app acquires a user token with delegated scopes and uses it to verify SharePoint site access.

### Application

The Next.js server uses the app registration's tenant ID, client ID, and client secret to request an app-only Microsoft Graph token via `client_credentials`. That token is used for backend SharePoint reads/writes and tenant user suggestions.
