// Number formatting utilities

export const formatSource = (source: string) => {
  if (source.toLowerCase() === "pump_fun") return "Pump.fun (Pump V1)";
  if (source.toLowerCase() === "pump_amm") return "PumpSwap (Pump AMM)";
  return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
};

export const formatLargeNumber = (num: number | undefined | null, condensed: boolean = false): string => {
  if (num === undefined || num === null || isNaN(num)) return "0";
  
  if (condensed) {
    if (num >= 1e12) return Math.round(num / 1e12) + "T";
    if (num >= 1e9) return Math.round(num / 1e9) + "B";
    if (num >= 1e6) return Math.round(num / 1e6) + "M";
    if (num >= 1e3) return Math.round(num / 1e3) + "K";
    if (num > 0 && num < 1)
      return num.toLocaleString(undefined, { maximumSignificantDigits: 4 });
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  
  // Original behavior with decimals
  if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
  if (num > 0 && num < 1)
    return num.toLocaleString(undefined, { maximumSignificantDigits: 4 });
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

export const formatPriceWithSubscript = (price: number | undefined | null): string => {
  if (price === undefined || price === null || isNaN(price)) return "0";
  if (price === 0) return "0";
  
  const absPrice = Math.abs(price);
  const isNegative = price < 0;
  
  if (absPrice < 0.001) {
    // Threshold for subscript notation
    const [coefficient, exponent] = absPrice.toExponential(4).split("e");
    const numZeros = Math.abs(parseInt(exponent)) - 1;
    const significantDigit = parseFloat(coefficient)
      .toString()
      .replace(".", "")
      .slice(0, 2);

    const toSubscript = (n: number) => {
      return n
        .toString()
        .split("")
        .map((char) => "₀₁₂₃₄₅₆₇₈₉"[parseInt(char)])
        .join("");
    };

    return `${isNegative ? '-' : ''}0.0${toSubscript(numZeros)}${significantDigit}`;
  }
  if (absPrice < 1) {
    return `${isNegative ? '-' : ''}${absPrice.toPrecision(2)}`;
  }
  return `${isNegative ? '-' : ''}${absPrice.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const lamportsToSol = (lamports: number): number => {
  return lamports / 1_000_000_000;
};

export const formatCurrency = (
  value: number | null | undefined,
  currency: "USD" | "SOL",
) => {
  if (value === null || value === undefined || isNaN(value)) {
    return "--";
  }

  const isUsd = currency === "USD";
  const minimumFractionDigits = isUsd ? 2 : 2;
  const maximumFractionDigits = isUsd ? 2 : 2;

  // Use Intl.NumberFormat for robust currency formatting
  const formatter = new Intl.NumberFormat("en-US", {
    style: isUsd ? "currency" : "decimal",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  });

  if (isUsd) {
    return formatter.format(value);
  } else {
    // For SOL, format as a decimal and append " SOL"
    return `${formatter.format(value)} SOL`;
  }
};


export const formatPercentage = (value: number | null | undefined) => {
  if (value === null || value === undefined || isNaN(value)) {
    return "--";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(value);
}

