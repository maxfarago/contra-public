import React from "react";

interface SummaryStatsProps {
  title: string;
  headers: string[];
  values: (string | number | { primary: string | number; secondary: string | number; colorize?: boolean })[];
  className?: string;
}

const SummaryStats: React.FC<SummaryStatsProps> = ({
  title,
  headers,
  values,
  className = "",
}) => {
  return (
    <div className={`summary-stats ${className}`}>
      <h3 className="summary-stats__title">{title}</h3>
      <table className="summary-stats__table">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={index} className="summary-stats__header">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {values.map((value, index) => {
              const isStacked = typeof value === 'object' && 'primary' in value;
              const shouldColorize = isStacked && value.colorize;
              
              // Determine if value is positive or negative for colorization
              const getColorClass = (val: string | number) => {
                if (!shouldColorize) return '';
                const numVal = typeof val === 'string' ? parseFloat(val.replace(/[$,]/g, '')) : val;
                return numVal > 0 ? 'summary-stats--positive' : numVal < 0 ? 'summary-stats--negative' : '';
              };

              return (
                <td key={index} className="summary-stats__value">
                  {isStacked ? (
                    <div className="summary-stats__stacked">
                      <div className={`summary-stats__primary ${getColorClass(value.primary)}`}>
                        {value.primary}
                      </div>
                      <div className={`summary-stats__secondary ${getColorClass(value.secondary)}`}>
                        {value.secondary}
                      </div>
                    </div>
                  ) : (
                    <span className={shouldColorize ? getColorClass(value) : ''}>
                      {value}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default SummaryStats;
