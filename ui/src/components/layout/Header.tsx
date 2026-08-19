import React from "react";
import { IoCheckmark, IoCopy } from "react-icons/io5";
import { Holding } from "../../types";
import { formatLargeNumber, formatSource } from "../../lib/formatters";

interface HeaderProps {
  tokenInfo?: Holding;
  holdingInWallet?: Holding | null;
  priceColor: string;
  copied: boolean;
  onCopy: (text: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  tokenInfo,
  holdingInWallet,
  priceColor,
  copied,
  onCopy,
}) => {
  if (!tokenInfo) {
    return (
      <header className="header">
        <h2 className="header__title" style={{ color: "var(--pico-muted-color)" }}>
          token search
        </h2>
      </header>
    );
  }

  return (
    <header className="header">
      <article className="p-0 text-left mb-0">
        <div
          className="header__actions"
          data-testid="token-info-main"
        >
          <div
            className="flex items-center gap-4"
            data-testid="token-identity"
          >
            <img
              src={tokenInfo.image}
              alt={tokenInfo.name}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
              }}
            />
            <div data-testid="token-name-and-symbol">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <h5
                  className="m-0 whitespace-nowrap truncate"
                  style={{ maxWidth: "185px" }}
                  title={tokenInfo.name}
                >
                  {tokenInfo.name}
                </h5>
                <button
                  type="button"
                  onClick={() => onCopy(tokenInfo.address)}
                  className="secondary"
                  style={{
                    width: "auto",
                    height: "auto",
                    padding: "0.25rem",
                  }}
                >
                  {copied ? <IoCheckmark size={16} /> : <IoCopy size={16} />}
                </button>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.9rem",
                  color: "var(--pico-muted-color)",
                  textTransform: "none",
                }}
              >
                {tokenInfo.symbol}
              </p>
            </div>
          </div>
          <div
            style={{ textAlign: "right", textTransform: "none" }}
            data-testid="token-price-and-source"
          >
            {tokenInfo.price_info && (
              <p
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  color: priceColor,
                  transition: "color 0.3s ease-in-out",
                }}
              >
                {formatLargeNumber(1 / tokenInfo.price_info.price_per_token)}{" "}
                {tokenInfo.symbol} / {tokenInfo.price_info.currency}
              </p>
            )}
            {tokenInfo.source && (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8rem",
                  color: "var(--pico-muted-color)",
                }}
              >
                {formatSource(tokenInfo.source)}
              </p>
            )}
          </div>
        </div>
        <div
          style={{
            marginTop: "1rem",
            borderTop: "1px solid var(--pico-muted-border-color)",
            paddingTop: "1rem",
            textAlign: "center",
            color: "var(--pico-muted-color)",
          }}
          data-testid="token-holdings"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "2rem",
              textAlign: "center",
            }}
          >
            <div>
              <p className="m-0 text-muted">
                Holdings
              </p>
              <p className="m-0">
                <span style={{ color: "white", textTransform: "none" }}>
                  {holdingInWallet
                    ? holdingInWallet.balance.toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })
                    : 0}{" "}
                  {tokenInfo.symbol}
                </span>
              </p>
            </div>
            {tokenInfo.market_cap && (
              <div>
                <p className="m-0 text-muted">
                  Market Cap
                </p>
                <p className="m-0">
                  <span style={{ color: "white", textTransform: "none" }}>
                    {formatLargeNumber(tokenInfo.market_cap)} SOL
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </article>
    </header>
  );
};

export default Header;
