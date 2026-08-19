import React, { useState, useEffect } from "react";

interface LoaderProps {
  size?: "small" | "medium";
  text?: string;
  hideSpinner?: boolean;
}

const Loader: React.FC<LoaderProps> = ({
  size = "medium",
  text,
  hideSpinner = false,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!text || size !== "small") return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % text.length);
    }, 200);

    return () => clearInterval(interval);
  }, [text, size]);

  // Small loader remains exactly the same
  if (size === "small") {
    const spinnerClass = "loader-spinner small";
    
    if (text) {
      return (
        <div className="loader loader--small">
          {!hideSpinner && <span aria-busy="true" className={spinnerClass} />}
          <span className="loader-text--animated">
            {text.split("").map((char, index) => (
              <span
                key={index}
                style={{
                  color:
                    index === activeIndex ? "#bbbbbb" : "var(--color-text-muted)",
                  whiteSpace: char === " " ? "pre" : "normal",
                }}
              >
                {char}
              </span>
            ))}
          </span>
        </div>
      );
    }

    return <span aria-busy="true" className={spinnerClass} />;
  }

  // Large loader: shimmer text only
  return (
    <div className="loader loader--large">
      <div className="loader-text--large">
        {text || "Loading..."}
      </div>
    </div>
  );
};

export default Loader;
