import { generateTicks } from './utils';

interface DynamicAxisProps {
  orientation: 'horizontal' | 'vertical';
  viewport: { viewLeft: number; viewRight: number; viewBottom: number; viewTop: number; };
  dimensions: { width: number; height: number; };
  domain: [number, number];
  renderOffset: number;
}

export const DynamicAxis = ({ orientation, viewport, dimensions, domain: axisDomain, renderOffset }: DynamicAxisProps) => {
  const { viewLeft, viewRight, viewBottom, viewTop } = viewport;
  const isHorizontal = orientation === 'horizontal';

  const viewDomain = isHorizontal ? [viewLeft - renderOffset, viewRight - renderOffset] : [viewBottom - renderOffset, viewTop - renderOffset];
  
  let ticks: number[];
  if (isHorizontal) {
    // Fixed 15-minute intervals for age axis (0, 15, 30, 45, ... up to 180 minutes)
    ticks = [];
    for (let minutes = 0; minutes <= 180; minutes += 15) {
      ticks.push(minutes * 60);
    }
  } else {
    // Calculate the desired number of ticks based on screen space for vertical axis
    const targetSpacing = 150; // Aim for a gridline every 150px
    const size = dimensions.height;
    const numTicks = Math.max(2, Math.round(size / targetSpacing));
    ticks = generateTicks(viewDomain[0], viewDomain[1], numTicks);
  }
  
  const scale = (value: number) => {
    const viewRange = viewDomain[1] - viewDomain[0];
    return ((value - viewDomain[0]) / viewRange) * 100;
  };

  return (
    <div className={`axis ${isHorizontal ? 'x-axis' : 'y-axis'}`}>
      <div className="axis-ticks">
        {ticks.map((tick) => {
          if (tick < axisDomain[0] || tick > axisDomain[1]) return null;
          
          const position = scale(tick);

          return (
            <div key={tick} className="tick" style={ isHorizontal ? { left: `${position}%` } : { bottom: `${position}%` }}>
              <span className="tick-label">{isHorizontal ? Math.round(tick / 60) : Math.round(tick)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

