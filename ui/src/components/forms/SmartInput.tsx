import React, { useEffect, useRef } from "react";

import Tooltip from "../ui/Tooltip";

import { PiQuestion as TooltipIcon } from "react-icons/pi";
import { SiSolana } from "react-icons/si";


interface SmartInputProps {
  // Common props
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  suffix: string;
  mode: "presets" | "slider";
  prefix?: string;
  prefixTooltip?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  style?: React.CSSProperties;
  isError?: boolean;
  disabled?: boolean;
  condensed?: boolean; // Condensed variant: hides prefix, shows icon for SOL
  
  // Presets mode props
  presetValues?: (string | number)[];
  onPresetClick?: (value: string | number) => void; // Custom preset click handler
  
  // Slider mode props
  baseValue?: number; // Required for slider mode
}

const SmartInput: React.FC<SmartInputProps> = ({
  name,
  value,
  onChange,
  suffix,
  mode,
  prefix = "AMOUNT",
  prefixTooltip,
  placeholder,
  required = false,
  className = "",
  style,
  isError = false,
  disabled = false,
  condensed = false,
  presetValues = [],
  onPresetClick,
  baseValue,
}) => {
  const prefixRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  // Calculate prefix width and set CSS custom property (skip if condensed)
  useEffect(() => {
    if (condensed) {
      if (fieldRef.current) {
        fieldRef.current.style.setProperty('--prefix-width', '0px');
      }
      return;
    }
    if (prefixRef.current && fieldRef.current) {
      const prefixWidth = prefixRef.current.offsetWidth;
      fieldRef.current.style.setProperty('--prefix-width', `${prefixWidth + 32}px`); // Add some padding
    }
  }, [prefix, condensed]);

  // For slider mode, calculate percentage from base value
  const getSliderPercentage = () => {
    if (mode !== "slider" || !baseValue) return 0;
    const parsedValue = parseFloat(value);
    const valueAsNumber = !isNaN(parsedValue) ? parsedValue : baseValue;
    return baseValue > 0 ? ((valueAsNumber / baseValue - 1) * 100) : 0;
  };

  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (mode !== "slider" || !baseValue) return;
    
    const newPercentage = parseFloat(e.target.value);
    const newValue = baseValue * (1 + newPercentage / 100);
    
    // Round to whole number for slider mode
    const roundedValue = Math.round(newValue);
    
    const syntheticEvent = {
      ...e,
      target: { ...e.target, name, value: roundedValue.toString() },
    };
    onChange(syntheticEvent as any);
  };

  // Handle preset button click
  const handlePresetClick = (presetValue: string | number) => {
    if (onPresetClick) {
      onPresetClick(presetValue);
    } else {
      const syntheticEvent = {
        target: { name, value: presetValue.toString() },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  const sliderPercentage = getSliderPercentage();

  const showPrefix = !condensed;
  const showSolanaIcon = condensed && suffix === "SOL";
  const displaySuffix = showSolanaIcon ? "" : suffix;

  return (
    <div className={`smart-input ${condensed ? 'smart-input--condensed' : ''} ${className}`}>
      {/* Top Row: Text Input */}
      <div className="smart-input__field" ref={fieldRef}>
        {showPrefix && (
          <Tooltip 
            content={prefixTooltip || ""} 
            position="left" 
            delay={200}
            disabled={!prefixTooltip}
          >
            <span 
              ref={prefixRef}
              className={`smart-input__icon ${prefixTooltip ? 'smart-input__icon--tooltip' : ''}`}
            >
              {prefix}{prefixTooltip && <TooltipIcon size={16} />}
            </span>
          </Tooltip>
        )}
        <input
          type="number"
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className={`smart-input__input ${isError ? 'smart-input__input--error' : ''}`}
          placeholder={placeholder}
          style={style}
          step={mode === "slider" ? "1" : undefined}
        />
        <span className={`smart-input__suffix ${isError ? 'smart-input__suffix--error' : ''}`}>
          {showSolanaIcon ? <SiSolana size={16} /> : displaySuffix}
        </span>
      </div>

      {/* Bottom Row: Presets or Slider */}
      {mode === "presets" && (
        <div className="smart-input__presets">
          {presetValues.map((presetValue, index) => (
            <button
              key={index}
              type="button"
              className="smart-input__preset-button"
              onClick={() => handlePresetClick(presetValue)}
              disabled={disabled}
            >
              {presetValue}
            </button>
          ))}
        </div>
      )}

      {mode === "slider" && baseValue !== undefined && (
        <div className="smart-input__slider">
          <div className="smart-input__slider-container">
            <div className="smart-input__slider-track">
              <div className="smart-input__slider-tick" style={{ left: '0%' }}></div>
              <div className="smart-input__slider-tick" style={{ left: '25%' }}></div>
              <div className="smart-input__slider-tick" style={{ left: '50%' }}></div>
              <div className="smart-input__slider-tick" style={{ left: '75%' }}></div>
              <div className="smart-input__slider-tick" style={{ left: '100%' }}></div>
            </div>
            <div className="smart-input__slider-labels">
              <span className="smart-input__slider-label" style={{ left: '0%' }}>-100%</span>
              <span className="smart-input__slider-label" style={{ left: '25%' }}>-50%</span>
              <span className="smart-input__slider-label" style={{ left: '50%' }}>0%</span>
              <span className="smart-input__slider-label" style={{ left: '75%' }}>50%</span>
              <span className="smart-input__slider-label" style={{ left: '100%' }}>100%</span>
            </div>
            <input
              type="range"
              min="-100"
              max="100"
              value={sliderPercentage}
              onChange={handleSliderChange}
              className="smart-input__slider-input"
              step="1"
              disabled={disabled}
            />
          </div>
          <span className="smart-input__slider-value">
            {sliderPercentage > 0 ? "+" : ""}
            {sliderPercentage.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
};

export default SmartInput;
