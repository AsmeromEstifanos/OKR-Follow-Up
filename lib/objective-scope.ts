import type { Objective, Venture } from "@/lib/types";

function normalize(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function objectiveBelongsToVenture(
  objective: Pick<Objective, "department" | "ventureName" | "strategicTheme">,
  venture: Pick<Venture, "name" | "departments">
): boolean {
  const normalizedVentureName = normalize(venture.name);
  const normalizedObjectiveVentureName = normalize(objective.ventureName);

  if (normalizedObjectiveVentureName) {
    return normalizedObjectiveVentureName === normalizedVentureName;
  }

  const normalizedTheme = normalize(objective.strategicTheme);
  if (normalizedTheme) {
    return normalizedTheme === normalizedVentureName;
  }

  const normalizedDepartment = normalize(objective.department);
  return venture.departments.some((department) => normalize(department.name) === normalizedDepartment);
}
