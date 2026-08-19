import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IoSearch } from "react-icons/io5";
import TokenSearch from "../token/TokenSearch";
import { Holding } from "../../types";

interface NavbarSearchProps {
  className?: string;
}

const NavbarSearch: React.FC<NavbarSearchProps> = ({ className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleSearchClick = () => {
    setIsOpen(true);
  };

  const handleOverlayClick = () => {
    setIsOpen(false);
  };

  const handleTokenSelect = (token: Holding) => {
    // Navigate to the token detail page and close the search
    navigate(`/portfolio/${token.address}`);
    setIsOpen(false);
  };

  return (
    <>
      {/* Search Button in Navbar */}
      <button
        className={`navbar-search ${className}`}
        onClick={handleSearchClick}
        type="button"
      >
        <IoSearch className="navbar-search__icon" />
        <span className="navbar-search__text">Search tokens...</span>
      </button>

      {/* Overlay and TokenSearch */}
      {isOpen && (
        <div className="navbar-search-overlay" onClick={handleOverlayClick}>
          <div className="navbar-search-modal" onClick={(e) => e.stopPropagation()}>
            <TokenSearch
              placeholder="Search for a token..."
              autoFocus={true}
              onTokenSelect={handleTokenSelect}
              className="navbar-search-token-search"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default NavbarSearch;
