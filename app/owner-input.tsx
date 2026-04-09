"use client";

import { apiPath } from "@/lib/base-path";
import { useEffect, useState } from "react";

type UserSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
};

type CachedUserSuggestions = {
  users: UserSuggestion[];
  cachedAt: number;
};

type Props = {
  id: string;
  label?: string;
  showLabel?: boolean;
  value: string;
  onChange: (next: string) => void;
  onSelectUser?: (user: UserSuggestion | null) => void;
  selectValue?: "displayName" | "email";
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

const OWNER_CACHE_KEY = "okr-owner-suggestions-v1";
const OWNER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SUGGESTIONS = 8;

function isDummySuggestion(user: UserSuggestion): boolean {
  const combined = `${user.displayName} ${user.principalName} ${user.mail}`.toLowerCase();
  return combined.includes("@contoso");
}

function isUserSuggestion(value: unknown): value is UserSuggestion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as UserSuggestion;
  return (
    typeof user.principalName === "string" &&
    typeof user.displayName === "string" &&
    typeof user.mail === "string"
  );
}

function parseCachedSuggestions(raw: string | null): UserSuggestion[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CachedUserSuggestions;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.cachedAt !== "number" ||
      !Array.isArray(parsed.users)
    ) {
      return [];
    }

    if (Date.now() - parsed.cachedAt > OWNER_CACHE_TTL_MS) {
      return [];
    }

    return parsed.users.filter(isUserSuggestion).filter((user) => !isDummySuggestion(user));
  } catch {
    return [];
  }
}

function saveCachedSuggestions(users: UserSuggestion[]): void {
  try {
    const payload: CachedUserSuggestions = {
      users,
      cachedAt: Date.now()
    };
    window.localStorage.setItem(OWNER_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage failures.
  }
}

export default function OwnerInput({
  id,
  label = "Owner",
  showLabel = true,
  value,
  onChange,
  onSelectUser,
  selectValue = "displayName",
  disabled = false,
  placeholder = "Type a user name",
  className = "",
  inputClassName = ""
}: Props): JSX.Element {
  const [allUsers, setAllUsers] = useState<UserSuggestion[]>([]);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [inputName] = useState<string>(() => {
    return `owner-${id}-${Math.random().toString(36).slice(2, 8)}`;
  });

  useEffect(() => {
    let mounted = true;
    const cachedUsers = parseCachedSuggestions(window.localStorage.getItem(OWNER_CACHE_KEY));
    if (cachedUsers.length > 0) {
      setAllUsers(cachedUsers);
    }

    const controller = new AbortController();
    void fetch(apiPath("/api/users/suggest?all=1"), {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          return [] as UserSuggestion[];
        }

        const payload = (await response.json()) as unknown;
        if (!Array.isArray(payload)) {
          return [] as UserSuggestion[];
        }

        return payload.filter(isUserSuggestion).filter((user) => !isDummySuggestion(user));
      })
      .then((users) => {
        if (!mounted || users.length === 0) {
          return;
        }

        setAllUsers(users);
        saveCachedSuggestions(users);
      })
      .catch(() => {
        // Keep cached users if request fails.
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const query = value.trim().toLowerCase();
    if (!query) {
      setSuggestions(allUsers.slice(0, MAX_SUGGESTIONS));
      return;
    }

    setSuggestions(
      allUsers
        .filter((user) => {
          return (
            user.displayName.toLowerCase().includes(query) ||
            user.principalName.toLowerCase().includes(query) ||
            user.mail.toLowerCase().includes(query)
          );
        })
        .slice(0, MAX_SUGGESTIONS)
    );
  }, [allUsers, value]);

  useEffect(() => {
    // Keep local typed value visible even when there are no suggestions.
    if (allUsers.length > 0 || value.trim().length > 0) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void fetch(apiPath("/api/users/suggest"), {
        cache: "no-store",
        signal: controller.signal
      })
        .then(async (response) => {
          if (!response.ok) {
            return [] as UserSuggestion[];
          }

          const payload = (await response.json()) as unknown;
          if (!Array.isArray(payload)) {
            return [] as UserSuggestion[];
          }

          return payload.filter(isUserSuggestion).filter((user) => !isDummySuggestion(user));
        })
        .then((items) => {
          if (items.length > 0) {
            setAllUsers(items);
          }
        })
        .catch(() => undefined);
    }, 120);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [allUsers.length, value]);

  return (
    <div className={`field ${className}`.trim()}>
      {showLabel ? <label htmlFor={id}>{label}</label> : null}
      <div className="owner-input-wrap">
        <input
          id={id}
          name={inputName}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            onSelectUser?.(null);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 100)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className={inputClassName || undefined}
          disabled={disabled}
        />
        {isOpen && suggestions.length > 0 ? (
          <ul className="owner-suggest-list" role="listbox" aria-label="Owner suggestions">
            {suggestions.map((user) => (
              <li key={user.principalName}>
                <button
                  type="button"
                  className="owner-suggest-item"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(selectValue === "email" ? user.mail || user.principalName : user.displayName);
                    onSelectUser?.(user);
                    setIsOpen(false);
                  }}
                >
                  <span className="owner-suggest-name">{user.displayName}</span>
                  <span className="owner-suggest-meta">{user.mail || user.principalName}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
