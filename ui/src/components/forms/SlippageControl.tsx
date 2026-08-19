import React, { useState, useEffect } from "react";

interface SlippageControlProps {
  value: string;
  onChange: (value: string) => void;
}

const SlippageControl: React.FC<SlippageControlProps> = ({
  value,
  onChange,
}) => {
  const [isCustom, setIsCustom] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (value !== "30") {
      setIsCustom(true);
    } else {
      setIsCustom(false);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsCustom(true);
    const numericValue = e.target.value.replace(/[^0-9.]/g, "");
    onChange(numericValue);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      onChange("30");
    } else if (num > 100) {
      onChange("100");
    }
  };

  return (
    <div
      className={`slippage-control ${isFocused ? 'slippage-control--focused' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="slippage-control__label">
        Slippage
      </span>
      <div className="slippage-control__right">
        <span className="slippage-control__mode">
          {isCustom ? "Custom" : "Auto"}
        </span>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          className="slippage-control__input"
        />
        <span className="slippage-control__suffix">
          %
        </span>
      </div>
    </div>
  );
};

export default SlippageControl;
