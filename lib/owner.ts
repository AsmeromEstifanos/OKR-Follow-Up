export function resolveOwnerName(owner?: string): string {
  return (owner ?? "").trim();
}

export function resolveOwnerEmail(owner?: string, ownerEmail?: string): string {
  const explicit = (ownerEmail ?? "").trim();
  if (explicit) {
    return explicit;
  }

  const fallbackOwner = resolveOwnerName(owner);
  return fallbackOwner.includes("@") ? fallbackOwner : "";
}
