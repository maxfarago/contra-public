import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import type { OrthographicViewState } from '@deck.gl/core';
import { AGE_DOMAIN, MCAP_DOMAIN, MIN_AGE_VIEW, RENDER_OFFSET, PADDING_X, PADDING_Y } from '../../components/atlas/constants';

interface UseAtlasViewStateReturn {
  viewState: OrthographicViewState | undefined;
  viewport: { viewLeft: number; viewRight: number; viewBottom: number; viewTop: number };
  dimensions: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement>;
  onViewStateChange: ({ viewState }: { viewState: OrthographicViewState }) => void;
}

export const useAtlasViewState = (): UseAtlasViewStateReturn => {
  const [viewState, setViewState] = useState<OrthographicViewState | undefined>();
  const [viewport, setViewport] = useState({ viewLeft: 0, viewRight: 0, viewBottom: 0, viewTop: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
        if (entries && entries.length > 0 && entries[0].contentRect) {
            setDimensions({
                width: entries[0].contentRect.width,
                height: entries[0].contentRect.height
            });
        }
    });

    const currentContainer = containerRef.current;
    if (currentContainer) {
        resizeObserver.observe(currentContainer);
    }

    return () => {
        if (currentContainer) {
            resizeObserver.unobserve(currentContainer);
        }
        resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      const paddedAgeDomainWidth = AGE_DOMAIN[1] - AGE_DOMAIN[0] + 2 * PADDING_X;
      const paddedMcapDomainHeight = MCAP_DOMAIN[1] - MCAP_DOMAIN[0] + 2 * PADDING_Y;

      const zoom: [number, number] = [
        Math.log2(dimensions.width / paddedAgeDomainWidth),
        Math.log2(dimensions.height / paddedMcapDomainHeight)
      ];
      
      const halfWidth = dimensions.width / (2 * Math.pow(2, zoom[0]));

      const target: [number, number, number] = [
        RENDER_OFFSET + halfWidth - PADDING_X,
        MCAP_DOMAIN[1] / 2 + RENDER_OFFSET,
        0
      ];

      const newViewState: OrthographicViewState = { target, zoom };
      
      const halfHeight = dimensions.height / (2 * Math.pow(2, zoom[1]));
      const viewLeft = target[0] - halfWidth;
      const viewRight = target[0] + halfWidth;
      const viewBottom = target[1] - halfHeight;
      const viewTop = target[1] + halfHeight;

      setViewport({ viewLeft, viewRight, viewBottom, viewTop });
      setViewState(newViewState);
    }
  }, [dimensions]);

  const onViewStateChange = ({ viewState: newViewState }: { viewState: OrthographicViewState }) => {
    if (!dimensions.width) {
      return;
    }
    
    let currentZoom: [number, number];
    if (typeof newViewState.zoom === 'number') {
      currentZoom = [newViewState.zoom, newViewState.zoom];
    } else if (Array.isArray(newViewState.zoom)) {
      currentZoom = newViewState.zoom;
    } else {
      currentZoom = [0, 0];
    }

    const currentTarget: [number, number, number] = Array.isArray(newViewState.target)
      ? [newViewState.target[0] || 0, newViewState.target[1] || 0, newViewState.target[2] || 0]
      : [0, 0, 0];

    const paddedAgeDomainWidth = AGE_DOMAIN[1] - AGE_DOMAIN[0] + 2 * PADDING_X;
    const paddedMcapDomainHeight = MCAP_DOMAIN[1] - MCAP_DOMAIN[0] + 2 * PADDING_Y;
    const minZoomX = Math.log2(dimensions.width / paddedAgeDomainWidth);
    const minZoomY = Math.log2(dimensions.height / paddedMcapDomainHeight);
    const maxZoomX = Math.log2(dimensions.width / MIN_AGE_VIEW);
  
    currentZoom[0] = Math.max(minZoomX, Math.min(currentZoom[0], maxZoomX));
    currentZoom[1] = Math.max(minZoomY, currentZoom[1]);
  
    const halfWidth = dimensions.width / (2 * Math.pow(2, currentZoom[0]));
    const halfHeight = dimensions.height / (2 * Math.pow(2, currentZoom[1]));
  
    const viewLeft = currentTarget[0] - halfWidth;
    const viewRight = currentTarget[0] + halfWidth;
    const viewBottom = currentTarget[1] - halfHeight;
    const viewTop = currentTarget[1] + halfHeight;
    
    if (viewLeft < AGE_DOMAIN[0] + RENDER_OFFSET - PADDING_X) {
      currentTarget[0] = AGE_DOMAIN[0] + RENDER_OFFSET - PADDING_X + halfWidth;
    }
    if (viewRight > AGE_DOMAIN[1] + RENDER_OFFSET + PADDING_X) {
      currentTarget[0] = AGE_DOMAIN[1] + RENDER_OFFSET + PADDING_X - halfWidth;
    }
    if (viewBottom < MCAP_DOMAIN[0] + RENDER_OFFSET - PADDING_Y) {
      currentTarget[1] = MCAP_DOMAIN[0] + RENDER_OFFSET - PADDING_Y + halfHeight;
    }
    if (viewTop > MCAP_DOMAIN[1] + RENDER_OFFSET + PADDING_Y) {
      currentTarget[1] = MCAP_DOMAIN[1] + RENDER_OFFSET + PADDING_Y - halfHeight;
    }
  
    setViewport({ viewLeft, viewRight, viewBottom, viewTop });
    setViewState({ ...newViewState, target: currentTarget, zoom: currentZoom });
  };

  return {
    viewState,
    viewport,
    dimensions,
    containerRef,
    onViewStateChange,
  };
};

