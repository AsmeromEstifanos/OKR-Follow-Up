"use client";

import { HELP_CATEGORIES, HELP_SECTIONS, type HelpSection } from "@/app/help/help-content";
import { useMemo, useState } from "react";

function renderBody(body: string): JSX.Element[] {
  const blocks: JSX.Element[] = [];
  const lines = body.split("\n");
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = (): void => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul className="help-list" key={`ul-${key++}`}>
        {bullets.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    blocks.push(
      <p className="help-paragraph" key={`p-${key++}`}>
        {line}
      </p>
    );
  }
  flushBullets();
  return blocks;
}

function matchesQuery(section: HelpSection, query: string): boolean {
  if (!query) return true;
  const haystack = `${section.title} ${section.category} ${section.body}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export default function HelpPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filtered = useMemo(() => {
    return HELP_SECTIONS.filter((section) => {
      const categoryOk = activeCategory === "All" || section.category === activeCategory;
      return categoryOk && matchesQuery(section, query);
    });
  }, [query, activeCategory]);

  const scrollToSection = (id: string): void => {
    const el = document.getElementById(`help-section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="help-page">
      <header className="help-header">
        <h1 className="help-title">Help &amp; User Guide</h1>
        <p className="help-subtitle">
          Everything you need to know about using OKR Follow-Up. Search or browse by topic below.
        </p>
        <div className="help-search-wrap">
          <input
            type="search"
            className="help-search"
            placeholder="Search the guide (e.g. reminders, mentions, RAG)…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search help"
          />
        </div>
        <div className="help-categories" role="tablist" aria-label="Help categories">
          <button
            type="button"
            className={`help-category-chip ${activeCategory === "All" ? "help-category-chip-active" : ""}`}
            onClick={() => setActiveCategory("All")}
          >
            All
          </button>
          {HELP_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`help-category-chip ${activeCategory === category ? "help-category-chip-active" : ""}`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </header>

      <div className="help-layout">
        <nav className="help-toc" aria-label="Table of contents">
          <span className="help-toc-heading">On this page</span>
          {filtered.length === 0 ? (
            <span className="help-toc-empty">No matches</span>
          ) : (
            <ul className="help-toc-list">
              {filtered.map((section) => (
                <li key={section.id}>
                  <button type="button" className="help-toc-link" onClick={() => scrollToSection(section.id)}>
                    {section.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="help-content">
          {filtered.length === 0 ? (
            <div className="help-empty">
              <p>No topics match &ldquo;{query}&rdquo;.</p>
              <button
                type="button"
                className="help-clear-btn"
                onClick={() => {
                  setQuery("");
                  setActiveCategory("All");
                }}
              >
                Clear search
              </button>
            </div>
          ) : (
            filtered.map((section) => (
              <section
                className="help-section"
                id={`help-section-${section.id}`}
                key={section.id}
              >
                <span className="help-section-category">{section.category}</span>
                <h2 className="help-section-title">{section.title}</h2>
                <div className="help-section-body">{renderBody(section.body)}</div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
