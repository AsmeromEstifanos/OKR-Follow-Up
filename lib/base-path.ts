function normalizeBasePath(input: string | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw || raw === "/") {
    return "";
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export const runtimeBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) {
    return path;
  }

  if (!runtimeBasePath) {
    return path;
  }

  if (path === "/") {
    return runtimeBasePath;
  }

  if (path.startsWith(`${runtimeBasePath}/`) || path === runtimeBasePath) {
    return path;
  }

  return `${runtimeBasePath}${path}`;
}

export function stripBasePath(pathname: string): string {
  if (!runtimeBasePath) {
    return pathname || "/";
  }

  if (pathname === runtimeBasePath) {
    return "/";
  }

  if (pathname.startsWith(`${runtimeBasePath}/`)) {
    return pathname.slice(runtimeBasePath.length) || "/";
  }

  return pathname || "/";
}

export function apiPath(path: string): string {
  return withBasePath(path);
}
