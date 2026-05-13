"use client";

import { apiPath } from "@/lib/base-path";
import { useEffect, useState } from "react";

type Props = {
  objectiveKey: string;
  objectiveTitle: string;
  onClose: () => void;
};

function SparkleIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

export default function AiSummaryModal({ objectiveKey, objectiveTitle, onClose }: Props): JSX.Element {
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function generate(): Promise<void> {
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
        throw new Error(payload.error ?? "AI summarization failed.");
      }

      setSummary(payload.summary ?? "");
      setHasGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI summarization failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="chat-overlay" onClick={onClose} aria-hidden="true" />

      <div className="chat-modal ai-modal" role="dialog" aria-modal="true" aria-label={`AI Summary: ${objectiveTitle}`}>
        {/* Header */}
        <div className="chat-modal-header">
          <div className="chat-modal-title-wrap">
            <span className="chat-modal-icon" aria-hidden="true">
              <SparkleIcon />
            </span>
            <div>
              <div className="chat-modal-label">AI Summary</div>
              <div className="chat-modal-title">{objectiveTitle}</div>
            </div>
          </div>
          <button type="button" className="chat-close-btn" onClick={onClose} aria-label="Close AI summary">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="ai-modal-body">
          {!hasGenerated && !isLoading && !error && (
            <div className="ai-modal-intro">
              <p>Get an instant executive summary of this objective — covering overall progress, blockers, confidence level, and recommended next actions.</p>
            </div>
          )}

          {isLoading && (
            <div className="ai-modal-loading">
              <div className="ai-modal-spinner" aria-hidden="true" />
              <span>Generating summary…</span>
            </div>
          )}

          {error && !isLoading && (
            <p className="ai-modal-error">{error}</p>
          )}

          {summary && !isLoading && (
            <div className="ai-modal-result">
              <p className="ai-modal-summary-text">{summary}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ai-modal-footer">
          <button
            type="button"
            className="ai-summary-btn"
            onClick={generate}
            disabled={isLoading}
          >
            <SparkleIcon />
            {isLoading ? "Generating…" : hasGenerated ? "Regenerate" : "Generate Summary"}
          </button>
          <button type="button" className="tab-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
