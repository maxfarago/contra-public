import React from "react";
import { formatLargeNumber } from "../../lib/formatters";

interface SliderFieldProps {
  label: string;
  name: string;
  value: string;
  currentMarketCap: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

const SliderField: React.FC<SliderFieldProps> = ({
  label,
  name,
  value,
  currentMarketCap,
  onChange,
  placeholder,
}) => {
  const parsedValue = parseFloat(value);
  const valueAsNumber = !isNaN(parsedValue) ? parsedValue : currentMarketCap;

  const percentage =
    currentMarketCap > 0
      ? ((valueAsNumber / currentMarketCap - 1) * 100).toFixed(0)
      : 0;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPercentage = parseFloat(e.target.value);
    const newMarketCap = currentMarketCap * (1 + newPercentage / 100);

    const syntheticEvent = {
      ...e,
      target: { ...e.target, name, value: newMarketCap.toString() },
    };
    onChange(syntheticEvent as any);
  };

  return (
    <div className="slider-field">
      <label className="slider-field__label">{label}</label>
      <input
        type="number"
        name={name}
        value={value}
        onChange={onChange}
        className="form__input"
        placeholder={placeholder}
        required
      />
      <div className="flex items-center gap-4 mt-2">
        <input
          type="range"
          min="-100"
          max="100"
          value={percentage}
          onChange={handleSliderChange}
          className="slider-field__input"
        />
        <span className="slider-field__value">
          {parseFloat(percentage.toString()) > 0 ? "+" : ""}
          {percentage}%
        </span>
      </div>
    </div>
  );
};

export default SliderField;
