"use client";

import type { Venture } from "@/lib/types";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Props = {
  ventures: Venture[];
  selectedVentureKey?: string;
  selectedDepartment?: string;
};

export default function DashboardFilters({
  ventures,
  selectedVentureKey,
  selectedDepartment
}: Props): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [ventureKey, setVentureKey] = useState<string>(selectedVentureKey ?? "");
  const [department, setDepartment] = useState<string>(selectedDepartment ?? "");

  useEffect(() => {
    setVentureKey(selectedVentureKey ?? "");
  }, [selectedVentureKey]);

  useEffect(() => {
    setDepartment(selectedDepartment ?? "");
  }, [selectedDepartment]);

  const departmentOptions = useMemo(() => {
    if (ventureKey) {
      const venture = ventures.find((item) => item.ventureKey === ventureKey);
      return (venture?.departments ?? []).map((item) => item.name);
    }

    return Array.from(
      new Set(
        ventures.flatMap((venture) => {
          return venture.departments.map((item) => item.name);
        })
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [ventureKey, ventures]);

  const applyFilters = (nextVentureKey: string, nextDepartment: string): void => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextVentureKey) {
      params.set("ventureKey", nextVentureKey);
    } else {
      params.delete("ventureKey");
    }

    if (nextDepartment) {
      params.set("department", nextDepartment);
    } else {
      params.delete("department");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const handleVentureChange = (value: string): void => {
    setVentureKey(value);
    setDepartment("");
    applyFilters(value, "");
  };

  const handleDepartmentChange = (value: string): void => {
    setDepartment(value);
    applyFilters(ventureKey, value);
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2>Filters</h2>
        <Link className="btn-link" href={pathname}>
          Clear
        </Link>
      </div>
      <div className="config-grid">
        <div className="field">
          <label htmlFor="ventureKey">Venture</label>
          <select
            id="ventureKey"
            name="ventureKey"
            value={ventureKey}
            onChange={(event) => handleVentureChange(event.target.value)}
          >
            <option value="">All ventures</option>
            {ventures.map((venture) => (
              <option key={venture.ventureKey} value={venture.ventureKey}>
                {venture.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="department">Department</label>
          <select id="department" name="department" value={department} onChange={(event) => handleDepartmentChange(event.target.value)}>
            <option value="">All departments</option>
            {departmentOptions.map((departmentName) => (
              <option key={departmentName} value={departmentName}>
                {departmentName}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
