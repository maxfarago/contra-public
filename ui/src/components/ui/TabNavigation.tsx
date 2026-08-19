import React from "react";
import "../../styles/components/tab-navigation.css";

interface Tab {
  id: string;
  label: string;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

const TabNavigation: React.FC<TabNavigationProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}) => {
  return (
    <nav className={`tab-container ${className}`}>
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onTabChange(tab.id);
          }}
          className={`tab-button ${activeTab === tab.id ? "tab-button--active" : ""}`}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
};

export default TabNavigation;
