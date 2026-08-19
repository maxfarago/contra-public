import React from "react";
import "../../styles/components/ghost-loader.css";

interface GhostLoaderProps {
  rows?: number;
  className?: string;
}

const GhostLoader: React.FC<GhostLoaderProps> = ({ 
  rows = 3, 
  className = "" 
}) => {
  return (
    <div className={`ghost-loader ${className}`}>
      <div className="portfolio-table-container">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Total Profit</th>
              <th>Balance</th>
              <th>Unrealized</th>
              <th>Realized</th>
              <th>Bought / Avg</th>
              <th>Sold / Avg</th>
              <th>Txs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, index) => (
              <tr key={index} className="ghost-loader__row">
                <td className="portfolio-token">
                  <div className="ghost-loader__token">
                    <div className="ghost-loader__token-image"></div>
                    <div className="ghost-loader__token-info">
                      <div className="ghost-loader__token-name"></div>
                      <div className="ghost-loader__token-symbol"></div>
                    </div>
                  </div>
                </td>
                <td className="portfolio-profit">
                  <div className="portfolio-value-stack">
                    <div className="ghost-loader__value"></div>
                    <div className="ghost-loader__percentage"></div>
                  </div>
                </td>
                <td>
                  <div className="portfolio-value-stack">
                    <div className="ghost-loader__value"></div>
                    <div className="ghost-loader__token-count"></div>
                  </div>
                </td>
                <td>
                  <div className="portfolio-value-stack">
                    <div className="ghost-loader__value"></div>
                    <div className="ghost-loader__percentage"></div>
                  </div>
                </td>
                <td className="portfolio-realized">
                  <div className="portfolio-value-stack">
                    <div className="ghost-loader__value"></div>
                    <div className="ghost-loader__percentage"></div>
                  </div>
                </td>
                <td>
                  <div className="portfolio-value-stack">
                    <div className="ghost-loader__value"></div>
                    <div className="ghost-loader__avg-price"></div>
                  </div>
                </td>
                <td>
                  <div className="portfolio-value-stack">
                    <div className="ghost-loader__value"></div>
                    <div className="ghost-loader__avg-price"></div>
                  </div>
                </td>
                <td>
                  <div className="portfolio-value-stack">
                    <div className="ghost-loader__tx-counts">
                      <div className="ghost-loader__tx-buy"></div>
                      <div className="ghost-loader__tx-separator"></div>
                      <div className="ghost-loader__tx-sell"></div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="ghost-loader__button"></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GhostLoader;
