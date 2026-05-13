"use client";

import { apiPath } from "@/lib/base-path";
import { useState } from "react";

type Props = {
  objectiveKey: string;
  objectiveTitle: string;
};

function SparkleIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

export default function AiSummaryPanel({ objectiveKey, objectiveTitle }: Props): JSX.Element {
  const [summary, setSummary] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  async function handleGenerate(): Promise<void> {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(apiPath("/api/ai/summarize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectiveKey })
      });

      const payload = (await response.json()) as { summary?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to generate summary.");
      }

      setSummary(payload.summary ?? "");
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="ai-summary-panel">
      <div className="ai-summary-header">
        <span className="ai-summary-label">
          <SparkleIcon />
          AI Summary
        </span>
        <button
          type="button"
          className="ai-summary-btn"
          onClick={handleGenerate}
          disabled={isLoading}
        >
          {isLoading ? "Generating…" : hasLoaded ? "Regenerate" : `Summarize "${objectiveTitle}"`}
        </button>
      </div>

      {error ? (
        <p className="ai-summary-error">{error}</p>
      ) : summary ? (
        <p className="ai-summary-body">{summary}</p>
      ) : (
        <p className="ai-summary-empty">
          Click &quot;Summarize&quot; to get an AI-generated executive summary of this objective&apos;s progress, risks, and recommended next actions.
        </p>
      )}
    </div>
  );
}
