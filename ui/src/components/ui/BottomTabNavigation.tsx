import React from "react";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface BottomTabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const BottomTabNavigation: React.FC<BottomTabNavigationProps> = ({
  tabs,
  activeTab,
  onTabChange,
}) => {
  return (
    <nav className="bottom-tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`bottom-tab-navigation__button ${
            activeTab === tab.id ? "bottom-tab-navigation__button--active" : ""
          }`}
          onClick={() => onTabChange(tab.id)}
          type="button"
        >
          {tab.icon && (
            <span className="bottom-tab-navigation__icon">{tab.icon}</span>
          )}
          <span className="bottom-tab-navigation__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default BottomTabNavigation;

