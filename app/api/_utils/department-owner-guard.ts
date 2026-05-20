import { getConfig, getKeyResult, getObjective, getUserRole, isAdminEmail } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveDepartmentOwnerEmail(owner: string | undefined, ownerEmail: string | undefined): string {
  const explicit = normalize(ownerEmail);
  if (explicit) {
    return explicit;
  }

  const ownerValue = (owner ?? "").trim();
  return ownerValue.includes("@") ? normalize(ownerValue) : "";
}

function getSignedInEmail(request: NextRequest): string {
  return normalize(request.headers.get("x-user-email"));
}

function isDepartmentOwner(
  departmentName: string,
  ventureName: string | undefined,
  signedInEmail: string
): Promise<boolean> {
  return getConfig().then((config) => {
    const normalizedDepartment = normalize(departmentName);
    const normalizedVenture = normalize(ventureName);

    if (!normalizedDepartment || !signedInEmail) {
      return false;
    }

    const ventures = normalizedVenture
      ? config.ventures.filter((venture) => normalize(venture.name) === normalizedVenture)
      : config.ventures;

    return ventures.some((venture) =>
      venture.departments.some((department) => {
        if (normalize(department.name) !== normalizedDepartment) {
          return false;
        }

        return resolveDepartmentOwnerEmail(department.owner, department.ownerEmail) === signedInEmail;
      })
    );
  });
}

// Editors can create/edit only items where their email matches the item's ownerEmail.
// Managers and Admins can act on anything.
async function resolveEffectiveRole(email: string): Promise<"admin" | "manager" | "editor" | "viewer" | null> {
  const isAdmin = await isAdminEmail(email);
  if (isAdmin) return "admin";
  const role = await getUserRole(email);
  if (!role) return null;
  return role.toLowerCase() as "admin" | "manager" | "editor" | "viewer";
}

export async function requireDepartmentOwnerOrAdminForObjectiveCreate(
  request: NextRequest,
  payload: { department?: string; ventureName?: string; ownerEmail?: string }
): Promise<NextResponse | null> {
  const signedInEmail = getSignedInEmail(request);
  if (!signedInEmail) {
    return NextResponse.json({ error: "Missing signed-in user email." }, { status: 401 });
  }

  const effectiveRole = await resolveEffectiveRole(signedInEmail);

  // Admin and Manager can create any objective
  if (effectiveRole === "admin" || effectiveRole === "manager") {
    return null;
  }

  const departmentName = (payload.department ?? "").trim();
  if (!departmentName) {
    return NextResponse.json({ error: "Department is required." }, { status: 400 });
  }

  // Department owner can create in their own department
  const ownerAllowed = await isDepartmentOwner(departmentName, payload.ventureName, signedInEmail);
  if (ownerAllowed) {
    return null;
  }

  // Editor can create if they are the ownerEmail of the objective being created
  if (effectiveRole === "editor") {
    const itemOwnerEmail = normalize(payload.ownerEmail);
    if (itemOwnerEmail && itemOwnerEmail === signedInEmail) {
      return null;
    }
    return NextResponse.json({ error: "Editors can only create objectives assigned to themselves." }, { status: 403 });
  }

  return NextResponse.json({ error: "Only the department owner, a manager, or an admin can create objectives." }, { status: 403 });
}

export async function requireDepartmentOwnerOrAdminForKrCreate(
  request: NextRequest,
  payload: { objectiveKey?: string; ownerEmail?: string }
): Promise<NextResponse | null> {
  const signedInEmail = getSignedInEmail(request);
  if (!signedInEmail) {
    return NextResponse.json({ error: "Missing signed-in user email." }, { status: 401 });
  }

  const effectiveRole = await resolveEffectiveRole(signedInEmail);

  // Admin and Manager can create any KR
  if (effectiveRole === "admin" || effectiveRole === "manager") {
    return null;
  }

  const objectiveKey = (payload.objectiveKey ?? "").trim();
  if (!objectiveKey) {
    return NextResponse.json({ error: "Objective key is required." }, { status: 400 });
  }

  const objective = await getObjective(objectiveKey);
  if (!objective) {
    return NextResponse.json({ error: "Objective not found." }, { status: 404 });
  }

  // Department owner of the parent objective's department can create KRs
  const ownerAllowed = await isDepartmentOwner(objective.department, objective.ventureName, signedInEmail);
  if (ownerAllowed) {
    return null;
  }

  // Editor can create a KR if they are the ownerEmail of the KR being created,
  // or if they own the parent objective
  if (effectiveRole === "editor") {
    const krOwnerEmail = normalize(payload.ownerEmail);
    if (krOwnerEmail && krOwnerEmail === signedInEmail) {
      return null;
    }
    const objectiveOwnerEmail = normalize(objective.ownerEmail ?? objective.owner);
    if (objectiveOwnerEmail && objectiveOwnerEmail === signedInEmail) {
      return null;
    }
    return NextResponse.json({ error: "Editors can only create key results on objectives they own." }, { status: 403 });
  }

  return NextResponse.json({ error: "Only the department owner, a manager, or an admin can create key results." }, { status: 403 });
}

// Guard for PATCH (update) — Editors can only update items they own
export async function requireOwnerOrManagerForUpdate(
  request: NextRequest,
  itemOwnerEmail: string | null | undefined
): Promise<NextResponse | null> {
  const signedInEmail = getSignedInEmail(request);
  if (!signedInEmail) {
    return NextResponse.json({ error: "Missing signed-in user email." }, { status: 401 });
  }

  const effectiveRole = await resolveEffectiveRole(signedInEmail);
  if (effectiveRole === "admin" || effectiveRole === "manager") {
    return null;
  }

  if (effectiveRole === "editor") {
    const ownerNormalized = normalize(itemOwnerEmail);
    if (ownerNormalized && ownerNormalized === signedInEmail) {
      return null;
    }
    return NextResponse.json({ error: "Editors can only edit items they own." }, { status: 403 });
  }

  // Viewer or no role
  return NextResponse.json({ error: "You do not have permission to edit this item." }, { status: 403 });
}

