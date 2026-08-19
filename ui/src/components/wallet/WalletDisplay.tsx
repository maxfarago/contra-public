import React, { useState, useEffect } from "react";
import { IoCopy, IoCheckmark, IoEye, IoEyeOff } from "react-icons/io5";
import QRCode from "qrcode";
import Loader from "../ui/Loader";

interface WalletDisplayProps {
  publicKey: string;
  privateKey: string;
  onDone: () => void;
}

const WalletDisplay: React.FC<WalletDisplayProps> = ({
  publicKey,
  privateKey,
  onDone,
}) => {
  const [copiedKey, setCopiedKey] = useState<"public" | "private" | null>(
    null
  );
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  useEffect(() => {
    if (publicKey) {
      QRCode.toDataURL(publicKey, {
        width: 160,
        margin: 2,
        color: {
          dark: "#dddddd",
          light: "#111111",
        },
      })
        .then(setQrCodeDataUrl)
        .catch(console.error);
    }
  }, [publicKey]);

  const handleCopy = (key: string, type: "public" | "private") => {
    navigator.clipboard.writeText(key);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="wallet-display-step">
      <h2>your wallet is ready</h2>

      <div className="wallet-display-layout">
        <div className="wallet-display-qr">
          {qrCodeDataUrl ? (
            <img src={qrCodeDataUrl} alt="Wallet QR Code" />
          ) : (
            <Loader text="generating qr code..." size="small" />
          )}
        </div>
        <div className="wallet-display-keys">
          {/* Public Key */}
          <div className="wallet-key">
            <label>public key</label>
            <div className="key-string">
              <span>{publicKey}</span>
              <button onClick={() => handleCopy(publicKey, "public")}>
                {copiedKey === "public" ? <IoCheckmark /> : <IoCopy />}
              </button>
            </div>
          </div>

          {/* Private Key */}
          <div className="wallet-key">
            <label>private key (secret)</label>
            <div className="key-string">
              <span className={showPrivateKey ? "" : "key-string--blurred"}>
                {showPrivateKey ? privateKey : "••••••••••••••••••••••••••••••••••••••••"}
              </span>
              <div className="key-string__actions">
                <button 
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="key-string__toggle-btn"
                  title={showPrivateKey ? "Hide private key" : "Show private key"}
                >
                  {showPrivateKey ? <IoEyeOff size={16} /> : <IoEye size={16} />}
                </button>
                <button onClick={() => handleCopy(privateKey, "private")}>
                  {copiedKey === "private" ? <IoCheckmark /> : <IoCopy />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p>
        store your private key somewhere safe. <strong>you will not be able to recover it.</strong>
      </p>

      <button
        onClick={onDone}
        className="wallet-setup-button"
      >
        Enjoy the trenches!
      </button>
    </div>
  );
};

export default WalletDisplay;
