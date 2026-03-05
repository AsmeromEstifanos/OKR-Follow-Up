/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_AZURE_CLIENT_ID:
      process.env.NEXT_PUBLIC_AZURE_CLIENT_ID ?? process.env.REACT_APP_AZURE_CLIENT_ID ?? "",
    NEXT_PUBLIC_AAD_TENANT_ID:
      process.env.NEXT_PUBLIC_AAD_TENANT_ID ?? process.env.REACT_APP_AAD_TENANT_ID ?? "",
    NEXT_PUBLIC_AZURE_AUTHORITY:
      process.env.NEXT_PUBLIC_AZURE_AUTHORITY ?? process.env.REACT_APP_AZURE_AUTHORITY ?? "",
    NEXT_PUBLIC_REDIRECT_URI:
      process.env.NEXT_PUBLIC_REDIRECT_URI ?? process.env.REACT_APP_REDIRECT_URI ?? "",
    NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI:
      process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? process.env.REACT_APP_POST_LOGOUT_REDIRECT_URI ?? "",
    NEXT_PUBLIC_LOGIN_SCOPES:
      process.env.NEXT_PUBLIC_LOGIN_SCOPES ?? process.env.REACT_APP_LOGIN_SCOPES ?? "",
    NEXT_PUBLIC_SHAREPOINT_SITE_URL:
      process.env.NEXT_PUBLIC_SHAREPOINT_SITE_URL ?? process.env.REACT_APP_SHAREPOINT_SITE_URL ?? "",
    NEXT_PUBLIC_SHAREPOINT_STORAGE_LIST:
      process.env.NEXT_PUBLIC_SHAREPOINT_STORAGE_LIST ?? process.env.REACT_APP_SHAREPOINT_STORAGE_LIST ?? ""
  }
};

export default nextConfig;
