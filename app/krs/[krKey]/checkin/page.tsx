"use client";

import type { CheckIn, Confidence, KeyResult, KrStatus } from "@/lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ApiError = {
  error?: string;
};

const STATUS_OPTIONS: KrStatus[] = ["OnTrack", "AtRisk", "OffTrack", "Done", "NotStarted"];
const CONFIDENCE_OPTIONS: Confidence[] = ["High", "Medium", "Low"];

export default function CheckInPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const rawKrKey = params.krKey;
  const krKey = useMemo(() => {
    if (Array.isArray(rawKrKey)) {
      return rawKrKey[0];
    }

    return rawKrKey;
  }, [rawKrKey]);

  const [kr, setKr] = useState<KeyResult | null>(null);
  const [status, setStatus] = useState<KrStatus>("OnTrack");
  const [confidence, setConfidence] = useState<Confidence>("Medium");
  const [currentValueSnapshot, setCurrentValueSnapshot] = useState<string>("0");
  const [updateNotes, setUpdateNotes] = useState<string>("");
  const [blockers, setBlockers] = useState<string>("");
  const [supportNeeded, setSupportNeeded] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!krKey) {
      return;
    }

    let cancelled = false;
    const load = async (): Promise<void> => {
      const response = await fetch(`/api/krs/${krKey}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json()) as ApiError;
        if (!cancelled) {
          setMessage(payload.error ?? "Unable to load KR.");
        }
        return;
      }

      const payload = (await response.json()) as KeyResult;
      let latestCheckIn: CheckIn | null = null;

      const checkInResponse = await fetch(`/api/checkins?krKey=${encodeURIComponent(krKey)}`, { cache: "no-store" });
      if (checkInResponse.ok) {
        const checkInsPayload = (await checkInResponse.json()) as CheckIn[];
        if (Array.isArray(checkInsPayload) && checkInsPayload.length > 0) {
          latestCheckIn = checkInsPayload[0];
        }
      }

      if (!cancelled) {
        setKr(payload);
        setStatus(latestCheckIn?.status ?? payload.status);
        setCurrentValueSnapshot(String(payload.currentValue));
        setConfidence(latestCheckIn?.confidence ?? "Medium");
        setUpdateNotes(latestCheckIn?.updateNotes ?? "");
        setBlockers(latestCheckIn?.blockers ?? "");
        setSupportNeeded(latestCheckIn?.supportNeeded ?? "");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [krKey]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!kr) {
      setMessage("KR not loaded yet.");
      return;
    }

    const nextValue = Number(currentValueSnapshot);
    if (Number.isNaN(nextValue)) {
      setMessage("Current value must be numeric.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const response = await fetch("/api/checkins", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        periodKey: kr.periodKey,
        objectiveKey: kr.objectiveKey,
        krKey: kr.krKey,
        owner: kr.owner,
        status,
        confidence,
        updateNotes,
        blockers,
        supportNeeded,
        currentValueSnapshot: nextValue,
        attachments: []
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as ApiError;
      setMessage(payload.error ?? "Unable to submit check-in.");
      setIsSubmitting(false);
      return;
    }

    router.push(`/objectives/${kr.objectiveKey}`);
  };

  return (
    <div>
      <h1 className="page-title">Update KR</h1>
      <p className="subtitle">{kr ? `${kr.title} (${kr.krCode ?? kr.krKey})` : "Loading key result..."}</p>

      <section className="section">
        {kr ? (
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(event) => setStatus(event.target.value as KrStatus)}>
                {STATUS_OPTIONS.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="confidence">Confidence</label>
              <select
                id="confidence"
                value={confidence}
                onChange={(event) => setConfidence(event.target.value as Confidence)}
              >
                {CONFIDENCE_OPTIONS.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="currentValue">Current Value</label>
              <input
                id="currentValue"
                type="number"
                step="any"
                value={currentValueSnapshot}
                onChange={(event) => setCurrentValueSnapshot(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="notes">Update Notes</label>
              <textarea id="notes" value={updateNotes} onChange={(event) => setUpdateNotes(event.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="blockers">Blockers</label>
              <textarea id="blockers" value={blockers} onChange={(event) => setBlockers(event.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="supportNeeded">Support Needed</label>
              <textarea
                id="supportNeeded"
                value={supportNeeded}
                onChange={(event) => setSupportNeeded(event.target.value)}
              />
            </div>

            <div className="actions">
              <button className="btn" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Update"}
              </button>
              <Link className="btn-link" href={kr ? `/objectives/${kr.objectiveKey}` : "/"}>
                Cancel
              </Link>
            </div>
            {message ? <p className="message danger">{message}</p> : null}
          </form>
        ) : (
          <p className="message">{message || "Loading..."}</p>
        )}
      </section>
    </div>
  );
}
