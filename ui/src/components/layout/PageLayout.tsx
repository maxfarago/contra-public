import React from "react";

interface PageLayoutProps {
  children: React.ReactNode;
  centerVertical?: boolean;
  maxWidth?: string | number;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  centerVertical,
  maxWidth = "1200px",
}) => {
  const style: React.CSSProperties = {
    maxWidth: maxWidth,
    margin: "0 auto",
    padding: "0 1rem",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    width: "100%",
    boxSizing: "border-box",
  };

  if (centerVertical) {
    style.justifyContent = "center";
  }

  return <div className="page-layout" style={style}>{children}</div>;
};

export default PageLayout;
