import React, { useState, useEffect, useRef } from "react";
import { RxOpenInNewWindow } from "react-icons/rx";
import { formatLogMessage, replaceOrderUuidWithIndex } from "../../lib/formatters";

interface Log {
  level: string;
  message: string;
  timestamp: string;
}

interface LogsProps {
  logs: Log[];
  orderIdToIndex?: Record<string, number>;
  hasWelcomeLogs?: boolean;
}

const Logs: React.FC<LogsProps> = ({ logs, orderIdToIndex, hasWelcomeLogs = false }) => {
  const [visibleLogs, setVisibleLogs] = useState<Log[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasAnimatedRef = useRef(false);

  // Reset animation flag when component mounts
  useEffect(() => {
    hasAnimatedRef.current = false;
  }, []);

  useEffect(() => {
    if (!logs || logs.length === 0) {
      setVisibleLogs([]);
      return;
    }

    const sortedLogs = logs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    );

    if (hasWelcomeLogs && !hasAnimatedRef.current) {
      // Animate welcome logs one by one, starting from the last one (welcome message)
      hasAnimatedRef.current = true;
      setVisibleLogs([]);
      setCurrentIndex(sortedLogs.length - 1);
      
      const interval = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= 0) {
            setVisibleLogs(prevLogs => [sortedLogs[prev], ...prevLogs]);
            return prev - 1;
          } else {
            clearInterval(interval);
            return prev;
          }
        });
      }, 900);

      return () => clearInterval(interval);
    } else {
      // Show all logs immediately (either no welcome logs or already animated)
      setVisibleLogs(sortedLogs);
    }
  }, [logs, hasWelcomeLogs]);

  if (!logs || logs.length === 0) {
    return <p>No logs available.</p>;
  }

  return (
    <div className="logs-container">
      {visibleLogs.map((log) => {
          const { formattedMessage, signature, orderId } = formatLogMessage(
            log.message
          );
          const withOrderIndex = replaceOrderUuidWithIndex(
            formattedMessage,
            orderIdToIndex
          );
          const timestamp = new Date(log.timestamp).toLocaleTimeString();

          const handleViewOrder = () => {
            if (orderId) {
              const orderElement = document.getElementById(`order-${orderId}`);
              if (orderElement) {
                orderElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add a temporary highlight effect
                orderElement.style.backgroundColor = 'var(--color-surface)';
                setTimeout(() => {
                  orderElement.style.backgroundColor = '';
                }, 2000);
              }
            }
          };

          // Create clickable "order" links within the message
          const renderMessageWithLinks = (message: string) => {
            if (!orderId) return message;
            
            // Split by "order" and create links
            const parts = message.split(/(\border\b)/gi);
            return parts.map((part, index) => {
              if (part.toLowerCase() === 'order') {
                return (
                  <a
                    key={index}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleViewOrder();
                    }}
                    className="logs-inline-order-link"
                    title="View Order"
                  >
                    {part}
                  </a>
                );
              }
              return part;
            });
          };

          return (
            <div
              key={`${log.timestamp}-${log.message}`}
              className="logs-entry"
            >
              <span className="logs-timestamp">
                [{timestamp}]
              </span>
              <span className="logs-message">
                {renderMessageWithLinks(withOrderIndex)}
              </span>
              {signature && (
                <div className="logs-actions">
                  <a
                    href={`https://solscan.io/tx/${signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="logs-solscan-link"
                    title="View on Solscan"
                  >
                    view on solscan
                    <RxOpenInNewWindow size={12} className="logs-solscan-icon" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default Logs;
