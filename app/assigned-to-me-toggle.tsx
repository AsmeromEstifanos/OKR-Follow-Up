"use client";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
};

export default function AssignedToMeToggle({
  checked,
  onChange,
  label = "Assigned to me"
}: Props): JSX.Element {
  return (
    <label className="ios-toggle">
      <span className="ios-toggle-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`ios-toggle-switch ${checked ? "ios-toggle-switch-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="ios-toggle-knob" />
      </button>
    </label>
  );
}
