import React from "react";

interface FormFieldProps {
  label: string;
  name: string;
  value: string;
  presets: number[];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPresetClick: (name: string, value: number) => void;
  unit?: string;
  helperText?: string;
  placeholder?: string;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  name,
  value,
  presets,
  onChange,
  onPresetClick,
  unit,
  helperText,
  placeholder,
}) => (
  <div style={{ marginBottom: "1rem" }}>
    <label>{label}</label>
    <div style={{ position: "relative" }}>
      <input
        type="number"
        name={name}
        value={value}
        onChange={onChange}
        style={{
          margin: "0.25rem 0",
          paddingRight: unit ? "2.5rem" : undefined,
        }}
        placeholder={placeholder}
        required
      />
      {unit && (
        <span
          style={{
            position: "absolute",
            right: "1rem",
            top: "50%",
            transform: "translateY(-50%)",
            color: "white",
            textTransform: "none",
          }}
        >
          {unit}
        </span>
      )}
    </div>
    <div className="flex gap-1 m-0">
      {presets.map((amount) => (
        <button
          key={amount}
          type="button"
          className="secondary preset-button"
          onClick={() => onPresetClick(name, amount)}
          style={{
            flex: 1,
            padding: "0.5rem",
            color: "var(--pico-muted-color) !important",
            fontSize: "0.75rem",
            fontWeight: "500",
          }}
        >
          {amount}
        </button>
      ))}
    </div>
    {helperText && (
      <small style={{ marginTop: "0.25rem", color: "var(--pico-muted-color)" }}>
        {helperText}
      </small>
    )}
  </div>
);

export default FormField;
