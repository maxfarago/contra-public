import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { IoChevronDown, IoCopyOutline, IoCheckmark } from "react-icons/io5";
import WalletInfo from "../wallet/WalletInfo";
import CurrencyToggle from "../shared/CurrencyToggle";
import DepositModal from "../wallet/DepositModal";
import { useCurrency } from "../../contexts/CurrencyContext";

interface NavbarProps {
  walletData?: {
    balance?: number;
    publicKey: string;
  };
  onCopyWallet?: (publicKey: string) => void;
  copied?: boolean;
  isVisible?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({
  walletData,
  onCopyWallet,
  copied = false,
  isVisible = true,
}) => {
  const { currency, setCurrency } = useCurrency();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);
  
  if (!isVisible) return null;

  return (
    <nav className="navbar">
      <div className="navbar__container">
        {/* Left: Logo and Portfolio */}
        <div className="navbar__left">
          <Link to="/home" className="navbar__logo">
            karta
          </Link>
          <Link to="/portfolio" className="navbar__link">
            Portfolio
          </Link>
        </div>

        {/* Right: Wallet Dropdown */}
        <div className="navbar__right">
          {walletData && (
            <div className="navbar__wallet-dropdown" ref={dropdownRef}>
              <div
                className="navbar__wallet-button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsDropdownOpen(!isDropdownOpen);
                  }
                }}
                aria-expanded={isDropdownOpen}
              >
                <WalletInfo 
                  balance={walletData.balance} 
                  publicKey={walletData.publicKey}
                  size="normal"
                  variant={walletData.balance && walletData.balance < 0.1 ? "error" : "default"}
                  onCopyAddress={onCopyWallet}
                  copied={copied}
                />
                <IoChevronDown size={16} className="navbar__chevron" />
              </div>
              
              {isDropdownOpen && (
                <div className="navbar__dropdown">
                  <div className="navbar__dropdown-item navbar__wallet-display">
                    <span className="navbar__wallet-address-text">
                      {walletData.publicKey.substring(0, 4)}...{walletData.publicKey.substring(walletData.publicKey.length - 4)}
                    </span>
                    <button
                      className={`token-info__copy-button ${copied ? 'token-info__copy-button--copied' : ''}`}
                      onClick={() => onCopyWallet && onCopyWallet(walletData.publicKey)}
                      aria-label="Copy wallet address"
                    >
                      {copied ? <IoCheckmark size={16} /> : <IoCopyOutline size={16} />}
                    </button>
                  </div>
                  <div className="navbar__dropdown-item">
                    <CurrencyToggle 
                      currency={currency} 
                      onCurrencyChange={setCurrency}
                    />
                  </div>
                  <button 
                    className="navbar__dropdown-item navbar__dropdown-button"
                    onClick={() => {
                      setIsDepositModalOpen(true);
                      setIsDropdownOpen(false);
                    }}
                  >
                    Deposit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Deposit Modal */}
      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        publicKey={walletData?.publicKey || ""}
        onDepositSuccess={() => setIsDepositModalOpen(false)}
      />
    </nav>
  );
};

export default Navbar;
