import { getConfig, getObjective, isAdminEmail } from "@/lib/store";
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

export async function requireDepartmentOwnerOrAdminForObjectiveCreate(
  request: NextRequest,
  payload: { department?: string; ventureName?: string }
): Promise<NextResponse | null> {
  const signedInEmail = getSignedInEmail(request);
  if (!signedInEmail) {
    return NextResponse.json({ error: "Missing signed-in user email." }, { status: 401 });
  }

  const isAdmin = await isAdminEmail(signedInEmail);
  if (isAdmin) {
    return null;
  }

  const departmentName = (payload.department ?? "").trim();
  if (!departmentName) {
    return NextResponse.json({ error: "Department is required." }, { status: 400 });
  }

  const ownerAllowed = await isDepartmentOwner(departmentName, payload.ventureName, signedInEmail);
  if (ownerAllowed) {
    return null;
  }

  return NextResponse.json({ error: "Only the department owner or an admin can create objectives." }, { status: 403 });
}

export async function requireDepartmentOwnerOrAdminForKrCreate(
  request: NextRequest,
  payload: { objectiveKey?: string }
): Promise<NextResponse | null> {
  const signedInEmail = getSignedInEmail(request);
  if (!signedInEmail) {
    return NextResponse.json({ error: "Missing signed-in user email." }, { status: 401 });
  }

  const isAdmin = await isAdminEmail(signedInEmail);
  if (isAdmin) {
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

  const ownerAllowed = await isDepartmentOwner(objective.department, objective.ventureName, signedInEmail);
  if (ownerAllowed) {
    return null;
  }

  return NextResponse.json({ error: "Only the department owner or an admin can create key results." }, { status: 403 });
}

