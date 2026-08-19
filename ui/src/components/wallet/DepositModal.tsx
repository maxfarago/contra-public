import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { IoCopy, IoCheckmark } from "react-icons/io5";
import QRCode from "qrcode";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import Loader from "../ui/Loader";
import "../../styles/components/deposit-modal.css";

interface WalletSolResponse {
  publicKey: string;
  balance?: number;
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  publicKey: string;
  onDepositSuccess?: () => void;
}

const fetchSolBalance = async (): Promise<WalletSolResponse> => {
  const { data } = await api.get("/wallet/sol");
  return data;
};

const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  publicKey,
  onDepositSuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [initialBalance, setInitialBalance] = useState<number | null>(null);
  const [balanceColor, setBalanceColor] = useState("var(--color-text)");
  const prevBalanceRef = useRef<number>();

  const {
    data: balanceData,
    isLoading: isCheckingBalance,
    refetch: checkBalance,
  } = useQuery<WalletSolResponse>({
    queryKey: ["solBalanceModal"],
    queryFn: fetchSolBalance,
    enabled: isOpen, // Only fetch when the modal is open
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop refetching if balance is found
      return data && data.balance && data.balance > 0 ? false : 5000;
    },
    retry: false,
  });

  // Track initial balance when modal opens
  useEffect(() => {
    if (isOpen && balanceData?.balance !== undefined && initialBalance === null) {
      setInitialBalance(balanceData.balance);
    }
  }, [isOpen, balanceData?.balance, initialBalance]);

  // Reset initial balance when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInitialBalance(null);
    }
  }, [isOpen]);

  // Balance flash effect
  useEffect(() => {
    if (balanceData?.balance !== undefined) {
      const currentBalance = balanceData.balance;
      const prevBalance = prevBalanceRef.current;
      if (prevBalance !== undefined && currentBalance !== prevBalance) {
        const newColor = currentBalance > prevBalance ? "var(--color-buy-bright)" : "var(--color-sell-bright)";
        setBalanceColor(newColor);
        const timer = setTimeout(() => setBalanceColor("var(--color-text)"), 1500);
        return () => clearTimeout(timer);
      }
      prevBalanceRef.current = currentBalance;
    }
  }, [balanceData?.balance]);

  // Effect to handle successful deposit (only when balance increases)
  useEffect(() => {
    if (balanceData && balanceData.balance && initialBalance !== null && balanceData.balance > initialBalance) {
      if (onDepositSuccess) {
        onDepositSuccess();
      } else {
        onClose();
      }
    }
  }, [balanceData, initialBalance, onDepositSuccess, onClose]);

  // Generate QR code when public key is available
  useEffect(() => {
    if (publicKey) {
      QRCode.toDataURL(publicKey, {
        width: 200,
        margin: 2,
        color: {
          dark: '#dddddd',
          light: '#111111'
        }
      }).then(setQrCodeDataUrl).catch(console.error);
    }
  }, [publicKey]);

  const handleCopyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      showCloseButton={true}
    >
      <div className="deposit-modal">
        <h2 className="deposit-modal__title">Add Funds</h2>
        <p className="deposit-modal__instruction">Send SOL to this address to begin trading.</p>
        
        <div className="deposit-modal__layout">
          <div className="deposit-modal__qr-section">
            {qrCodeDataUrl ? (
              <img 
                src={qrCodeDataUrl} 
                alt="Wallet QR Code" 
                className="deposit-modal__qr-code"
              />
            ) : (
              <div className="deposit-modal__qr-placeholder">
                <Loader text="Generating..." size="small"/>
              </div>
            )}
          </div>
          
          <div className="deposit-modal__info-section">
            <div className="deposit-modal__address-section">
              <h3 className="deposit-modal__address-title">Wallet Address</h3>
              <div className="deposit-modal__address-container">
                <div className="deposit-modal__address-text">
                  {publicKey || 'No wallet connected'}
                </div>
                <button
                  className="deposit-modal__copy-button"
                  onClick={handleCopyAddress}
                  disabled={!publicKey}
                  title="Copy wallet address"
                >
                  {copied ? <IoCheckmark size={16} /> : <IoCopy size={14} />}
                </button>
              </div>
            </div>
            
            <div className="deposit-modal__balance-section">
              
              <div className="deposit-modal__balance-row">
                <div className="deposit-modal__current-balance">
                  <h3 className="deposit-modal__address-title">Wallet Balance</h3>
                  <div className="deposit-modal__balance-display">
                    {balanceData?.balance !== undefined ? (
                      <span 
                        className="deposit-modal__balance-amount"
                        style={{ color: balanceColor }}
                      >
                        {balanceData.balance.toFixed(4)} SOL
                      </span>
                    ) : (
                      <span className="deposit-modal__balance-loading">Loading...</span>
                    )}
                  </div>
                </div>
                
                <div className="deposit-modal__balance-check">
                  <button
                    type="button"
                    onClick={() => checkBalance()}
                    disabled={isCheckingBalance}
                    className="btn btn--sm deposit-modal__check-button"
                  >
                    {isCheckingBalance ? "Checking..." : "Check Balance"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DepositModal;
