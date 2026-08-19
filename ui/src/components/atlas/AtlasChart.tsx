import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import type { PickingInfo, OrthographicViewState } from '@deck.gl/core';
import { DynamicAxis } from './DynamicAxis';
import { AGE_DOMAIN, MCAP_DOMAIN, RENDER_OFFSET } from './constants';
import { EnrichedTokenData } from './types';
import { useRef, useEffect } from 'react';

interface AtlasChartProps {
  layers: any[];
  viewState: OrthographicViewState | undefined;
  viewport: { viewLeft: number; viewRight: number; viewBottom: number; viewTop: number };
  dimensions: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement>;
  onViewStateChange: ({ viewState }: { viewState: OrthographicViewState }) => void;
  onHover: (token: EnrichedTokenData | null) => void;
}

export const AtlasChart = ({
  layers,
  viewState,
  viewport,
  dimensions,
  containerRef,
  onViewStateChange,
  onHover,
}: AtlasChartProps) => {
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMouseOverCanvasRef = useRef<boolean>(false);
  const lastHoveredMintRef = useRef<string | null>(null);

  const handleMouseEnter = () => {
    isMouseOverCanvasRef.current = true;
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    isMouseOverCanvasRef.current = false;
    // only clear selection when mouse actually leaves the canvas
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
    }
    clearTimeoutRef.current = setTimeout(() => {
      if (!isMouseOverCanvasRef.current) {
        lastHoveredMintRef.current = null;
        onHover(null);
      }
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div 
      className="chart-container" 
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {viewState && (
        <>
          <DynamicAxis 
            orientation="horizontal" 
            viewport={viewport} 
            dimensions={dimensions} 
            domain={AGE_DOMAIN} 
            renderOffset={RENDER_OFFSET} 
          />
          <DynamicAxis 
            orientation="vertical" 
            viewport={viewport} 
            dimensions={dimensions} 
            domain={MCAP_DOMAIN} 
            renderOffset={RENDER_OFFSET} 
          />
        </>
      )}
      
      <div className="x-axis">
        <span className="axis-label">AGE (minutes)</span>
      </div>

      <div className="y-axis">
        <span className="axis-label">MARKET CAP (SOL)</span>
      </div>

      {dimensions.width > 0 && dimensions.height > 0 && viewState && (
        <DeckGL
          width={dimensions.width}
          height={dimensions.height}
          views={new OrthographicView({ id: 'ortho', flipY: false })}
          viewState={viewState}
          onViewStateChange={onViewStateChange}
          controller={false}
          layers={layers}
          onHover={({ object }: PickingInfo) => {
            // always clear any pending clear timeout when hovering
            if (clearTimeoutRef.current) {
              clearTimeout(clearTimeoutRef.current);
              clearTimeoutRef.current = null;
            }

            if (object) {
              const token = object as EnrichedTokenData;
              // only update if it's a different token to avoid unnecessary updates
              if (lastHoveredMintRef.current !== token.mint) {
                lastHoveredMintRef.current = token.mint;
                onHover(token);
              }
            }
            // don't clear on null - only clear when mouse leaves canvas entirely
          }}
        />
      )}
      <div className="chart-vignette" />
    </div>
  );
};

