import React from "react";

interface ProtocolIconProps {
  source?: string;
}

const ProtocolIcon: React.FC<ProtocolIconProps> = ({ source }) => {
  const s = source?.toLowerCase();
  let iconSrc = "";

  if (s === "pump_fun") {
    iconSrc = "/icons/pumpfun.png";
  } else if (s === "pump_amm") {
    iconSrc = "/icons/pumpswap.png";
  } else {
    return null;
  }

  return (
    <img
      src={iconSrc}
      alt={s}
      style={{
        width: "12px",
        height: "12px",
        marginRight: "0.5rem",
        verticalAlign: "middle",
      }}
    />
  );
};

export default ProtocolIcon;
