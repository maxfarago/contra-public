import React, { useState } from "react";

interface SectionProps {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ isActive, onClick, children }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section
      className="section"
      style={{
        animation: "fadeIn 0.35s",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {!isActive && (
        <div
          onClick={onClick}
          className="section__overlay"
          style={{
            opacity: isHovered ? 0 : 0.75,
          }}
        />
      )}
    </section>
  );
};

export default Section;
