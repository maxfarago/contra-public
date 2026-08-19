import { useState, useEffect, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { ScatterplotLayer, TextLayer, LineLayer } from '@deck.gl/layers';
import type { OrthographicViewState } from '@deck.gl/core';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatLargeNumber, formatCurrency } from '../../lib/formatters';
import { useAtlasHoldings, AtlasHolding } from './useAtlasHoldings';
import { EnrichedTokenData, TokenData, OpacityMetric } from '../../components/atlas/types';
import { AGE_DOMAIN, MCAP_DOMAIN, RENDER_OFFSET, MIGRATION_THRESHOLD_SOL } from '../../components/atlas/constants';
import { normalizeOpacity } from '../../components/atlas/utils';

interface UseDeckGLLayersParams {
  tokensRef: MutableRefObject<Map<string, TokenData>>;
  viewState: OrthographicViewState | undefined;
  dimensions: { width: number; height: number };
  migrationThresholdUsd: number | null;
  opacityMetric: OpacityMetric;
  selectedToken: EnrichedTokenData | null;
  onSelectedTokenUpdate: (token: EnrichedTokenData | null) => void;
}

interface UseDeckGLLayersReturn {
  layers: any[];
  enrichedTokens: EnrichedTokenData[];
}

const metricRanges: Record<OpacityMetric, { min: number; max: number }> = {
  volume: { min: 0, max: 1000 },
  tx_count: { min: 0, max: 10000 },
};

export const useDeckGLLayers = ({
  tokensRef,
  viewState,
  dimensions,
  migrationThresholdUsd,
  opacityMetric,
  selectedToken,
  onSelectedTokenUpdate,
}: UseDeckGLLayersParams): UseDeckGLLayersReturn => {
  const { currency } = useCurrency();
  const [layers, setLayers] = useState<any[]>([]);
  const [enrichedTokens, setEnrichedTokens] = useState<EnrichedTokenData[]>([]);
  const interpolatedTokens = useRef<Map<string, { market_cap: number; volume: number; tx_count: number }>>(new Map());
  const animationFrame = useRef<number | null>(null);
  const frameCount = useRef<number>(0);
  // track last data values to avoid unnecessary updates
  const lastSelectedTokenData = useRef<{ mint: string; market_cap: number; volume: number; tx_count: number } | null>(null);
  const selectedTokenRef = useRef<EnrichedTokenData | null>(selectedToken);
  const onSelectedTokenUpdateRef = useRef(onSelectedTokenUpdate);
  
  // keep refs in sync
  useEffect(() => {
    selectedTokenRef.current = selectedToken;
    // reset tracking when selection changes (hover controls selection, not us)
    if (selectedToken?.mint !== lastSelectedTokenData.current?.mint) {
      lastSelectedTokenData.current = null;
    }
  }, [selectedToken]);
  
  useEffect(() => {
    onSelectedTokenUpdateRef.current = onSelectedTokenUpdate;
  }, [onSelectedTokenUpdate]);

  const { data: atlasHoldingsData } = useAtlasHoldings();

  const atlasHoldingsMap = useMemo(() => {
    const map = new Map<string, AtlasHolding>();
    if (atlasHoldingsData) {
      for (const holding of atlasHoldingsData) {
        map.set(holding.mint, holding);
      }
    }
    return map;
  }, [atlasHoldingsData]);

  // when holdings data loads or changes, reset tracking to force update of selected token
  useEffect(() => {
    if (atlasHoldingsData && selectedTokenRef.current) {
      // reset tracking so next frame will detect the change and update selected token
      lastSelectedTokenData.current = null;
    }
  }, [atlasHoldingsData]);

  const animate = useCallback(() => {
    if (!viewState || !dimensions.width) {
      animationFrame.current = requestAnimationFrame(animate);
      return;
    }

    const paddedAgeDomainWidth = AGE_DOMAIN[1] - AGE_DOMAIN[0] + 2 * 300;
    const initialZoomX = Math.log2(dimensions.width / paddedAgeDomainWidth);
    const baseRadius = 4;
    let lastTimestamp = Date.now();

    const frame = () => {
      const now = Date.now() / 1000;
      const currentTimestamp = Date.now();
      const deltaTime = (currentTimestamp - lastTimestamp) / 1000;
      lastTimestamp = currentTimestamp;

      const interpolationSpeed = 1;
      const lerpFactor = 1 - Math.exp(-deltaTime * interpolationSpeed);

      // read directly from ref - always gets latest data
      const currentTokens = tokensRef.current;
      const tokenArray = Array.from(currentTokens.values());
      
      // log every 60 frames (~1 second at 60fps)
      frameCount.current += 1;
      
      const tokensWithAgeAndHoldings = tokenArray.map((token): EnrichedTokenData => {
        const mint = token.mint;
        const targetMarketCap = token.market_cap ?? 0;
        const targetVolume = token.volume ?? 0;
        const targetTxCount = token.tx_count ?? 0;
        
        let interpolated = interpolatedTokens.current.get(mint);
        if (!interpolated) {
          interpolated = {
            market_cap: targetMarketCap,
            volume: targetVolume,
            tx_count: targetTxCount,
          };
          interpolatedTokens.current.set(mint, interpolated);
        } else {
          interpolated.market_cap += (targetMarketCap - interpolated.market_cap) * lerpFactor;
          interpolated.volume += (targetVolume - interpolated.volume) * lerpFactor;
          interpolated.tx_count += (targetTxCount - interpolated.tx_count) * lerpFactor;
        }
        
        const enrichedToken: EnrichedTokenData = {
          ...token,
          age: now - token.created_timestamp,
          market_cap: interpolated.market_cap,
          volume: interpolated.volume,
          tx_count: interpolated.tx_count,
        };

        const holding = atlasHoldingsMap.get(mint);
        if (holding) {
          const tokenPriceSol = enrichedToken.market_cap && enrichedToken.market_cap > 0 
            ? enrichedToken.market_cap / 1_000_000_000
            : 0;
          const tokenPriceUsd = enrichedToken.market_cap_usd && enrichedToken.market_cap_usd > 0
            ? enrichedToken.market_cap_usd / 1_000_000_000
            : 0;

          const currentValueSol = holding.quantity * tokenPriceSol;
          const currentValueUsd = holding.quantity * tokenPriceUsd;
          const pnlSol = currentValueSol - holding.cost_basis_sol;
          const pnlUsd = currentValueUsd - holding.cost_basis_usd;
          const pnlPercent = holding.cost_basis_sol > 0 ? (pnlSol / holding.cost_basis_sol) * 100 : 0;

          enrichedToken.holding = {
            ...holding,
            current_value_sol: currentValueSol,
            current_value_usd: currentValueUsd,
            pnl_sol: pnlSol,
            pnl_usd: pnlUsd,
            pnl_percent: pnlPercent,
          };
        }

        return enrichedToken;
      });
      
      const currentMints = new Set(Array.from(tokensRef.current.keys()));
      for (const mint of interpolatedTokens.current.keys()) {
        if (!currentMints.has(mint)) {
          interpolatedTokens.current.delete(mint);
        }
      }

      setEnrichedTokens(tokensWithAgeAndHoldings);
      
      // log every 60 frames (~1 second at 60fps) to avoid spam
      frameCount.current += 1;

      // update selected token data if one is selected
      // note: hover controls WHICH token is selected, we only update its data
      const currentSelectedToken = selectedTokenRef.current;
      if (currentSelectedToken) {
        const liveData = tokensWithAgeAndHoldings.find(t => t.mint === currentSelectedToken.mint);
        if (liveData) {
          // only update if this is still the selected token (check mint to prevent race conditions)
          if (liveData.mint === currentSelectedToken.mint) {
            // check if data changed (market metrics or holdings)
            const lastData = lastSelectedTokenData.current;
            const dataChanged = !lastData || 
              lastData.market_cap !== liveData.market_cap ||
              lastData.volume !== liveData.volume ||
              lastData.tx_count !== liveData.tx_count;
            
            // also check if holding changed (e.g., holdings data loaded, or trade_fill updated it)
            const holdingChanged = 
              (currentSelectedToken.holding?.quantity !== liveData.holding?.quantity) ||
              (currentSelectedToken.holding?.cost_basis_sol !== liveData.holding?.cost_basis_sol) ||
              (!currentSelectedToken.holding && liveData.holding) ||
              (currentSelectedToken.holding && !liveData.holding);
            
            if (dataChanged || holdingChanged) {
              lastSelectedTokenData.current = {
                mint: liveData.mint,
                market_cap: liveData.market_cap ?? 0,
                volume: liveData.volume ?? 0,
                tx_count: liveData.tx_count ?? 0,
              };
              // update with fresh data (same token, just updated values including holdings)
              onSelectedTokenUpdateRef.current(liveData);
            }
          }
        } else {
          // selected token was deleted from dataset, clear selection
          lastSelectedTokenData.current = null;
          onSelectedTokenUpdateRef.current(null);
        }
      } else {
        // no selection, clear tracking
        lastSelectedTokenData.current = null;
      }

      // ZOOM-SUPPORT - DYNAMIC RADIUS CALCULATION (TURNED OFF)
      //
      // const currentZoomX = (viewState.zoom as [number, number])[0];
      // const deltaZoom = currentZoomX - initialZoomX;
      // const radiusScale = Math.pow(2, deltaZoom);
      // const scaledRadius = baseRadius * radiusScale;
      // const finalRadius = Math.max(1.5, Math.min(scaledRadius, 20));

      // for now, use a fixed radius
      const finalRadius = 3;
      
      const time = Date.now() / 1000;
      
      const migrationLineLayer = new LineLayer({
        id: 'migration-threshold-line',
        data: [{
          source: [AGE_DOMAIN[0], MIGRATION_THRESHOLD_SOL + RENDER_OFFSET],
          target: [AGE_DOMAIN[1], MIGRATION_THRESHOLD_SOL + RENDER_OFFSET]
        }],
        getSourcePosition: d => d.source,
        getTargetPosition: d => d.target,
        getColor: [50, 50, 50, 255],
        getWidth: 1,
      });

      const migrationTextLayer = new TextLayer({
        id: 'migration-threshold-label',
        data: [{
          position: [AGE_DOMAIN[1] / 2, MIGRATION_THRESHOLD_SOL + RENDER_OFFSET]
        }],
        getPosition: d => d.position,
        getText: () => {
          if (currency === 'USD') {
            if (migrationThresholdUsd) {
              return `MIGRATION ($${formatLargeNumber(migrationThresholdUsd, true)})`;
            }
            return 'MIGRATION';
          }
          return `MIGRATION (${formatCurrency(MIGRATION_THRESHOLD_SOL, 'SOL')})`;
        },
        getColor: [100, 100, 100, 255],
        getSize: 10,
        getPixelOffset: [0, 4],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'top',
        fontFamily: 'Gabarito, sans-serif',
        fontWeight: 400,
        updateTriggers: {
          getText: [currency, migrationThresholdUsd],
        },
      });

      const scatterplotLayer = new ScatterplotLayer<EnrichedTokenData>({
        id: 'scatterplot-layer',
        data: tokensWithAgeAndHoldings, // use fresh data from this frame
        getPosition: d => {
          const phaseX = d.mint.charCodeAt(0) || 0;
          
          const jitterX = Math.sin(time * 2 + phaseX) * 1.5;
          
          const marketCap = d.market_cap || 0;
          const yPos = Math.min(marketCap, MCAP_DOMAIN[1]);

          const pos: [number, number, number] = [
            d.age! + RENDER_OFFSET + jitterX,
            yPos + RENDER_OFFSET,
            0
          ];
          return pos;
        },
        getFillColor: d => {
          // use 5-min volume for opacity when available; fallback to total volume
          let value: number;
          if (opacityMetric === 'volume') {
            value = (d.volume_5min != null ? d.volume_5min : d.volume) ?? 0;
          } else {
            value = d[opacityMetric] ?? 0;
          }
          const VOLUME_5MIN_MAX = 85;
          const intensity = normalizeOpacity(value, 0, VOLUME_5MIN_MAX);
          
          let baseColor: [number, number, number];
          const status = d.status?.toLowerCase();
          if (selectedToken?.mint === d.mint) {
            baseColor = [0, 170, 255]; // color-info: #00aaff
          // } else if (d.is_mayhem_mode) {
          //   baseColor = [255, 0, 0]; // bright red for mayhem
          } else if (status === 'live') {
            baseColor = [238, 110, 255];
          } else if (status === 'migrated') {
            baseColor = [255, 170, 0];
          } else if (status === 'complete') {
            baseColor = [255, 215, 0];
          } else {
            const isEnriched = d.market_cap != null && d.market_cap > 0;
            baseColor = isEnriched ? [238, 110, 255] : [162, 74, 174];
          }
          
          return [baseColor[0] * intensity, baseColor[1] * intensity, baseColor[2] * intensity, 255];
        },
        stroked: true,
        getLineColor: d => {
          // use 5-min volume for opacity when available; fallback to total volume
          let value: number;
          if (opacityMetric === 'volume') {
            value = (d.volume_5min != null ? d.volume_5min : d.volume) ?? 0;
          } else {
            value = d[opacityMetric] ?? 0;
          }

          if (d.is_mayhem_mode) {
            return [255, 0, 0, 150];
          }

          // upper bound of 5-min volume set to 85 SOL
          const VOLUME_5MIN_MAX = 85;
          const intensity = 0.1 + (normalizeOpacity(value, 0, VOLUME_5MIN_MAX) * 0.5);
          
          let baseColor: [number, number, number];
          const status = d.status?.toLowerCase();
          if (selectedToken?.mint === d.mint) {
            baseColor = [0, 170, 255]; // color-info: #00aaff
          } else if (status === 'live') {
            baseColor = [238, 110, 255];
          } else if (status === 'migrated') {
            baseColor = [255, 170, 0];
          } else if (status === 'complete') {
            baseColor = [255, 215, 0];
          } else {
            const isEnriched = d.market_cap != null && d.market_cap > 0;
            baseColor = isEnriched ? [238, 110, 255] : [162, 74, 174];
          }
          
          return [baseColor[0] * intensity, baseColor[1] * intensity, baseColor[2] * intensity, 255];
        },
        getLineWidth: 12, // 2px border
        getRadius: finalRadius,
        radiusUnits: 'pixels',
        pickable: true,
        autoHighlight: false,
      });

      // halo layer for tokens with holdings - renders behind main layer
      const holdingsHaloLayer = new ScatterplotLayer<EnrichedTokenData>({
        id: 'holdings-halo-layer',
        data: tokensWithAgeAndHoldings.filter(d => d.holding), // only tokens with holdings
        getPosition: d => {
          const phaseX = d.mint.charCodeAt(0) || 0;
          const jitterX = Math.sin(time * 2 + phaseX) * 1.5;
          const marketCap = d.market_cap || 0;
          const yPos = Math.min(marketCap, MCAP_DOMAIN[1]);
          return [d.age! + RENDER_OFFSET + jitterX, yPos + RENDER_OFFSET, 0];
        },
        getFillColor: [0, 0, 0, 0], // transparent fill
        stroked: true, // enable border
        getLineColor: d => {
          // never held: no halo (transparent)
          if (!d.holding) {
            return [0, 0, 0, 0];
          }
          
          // currently holding: green/red halo based on profit/loss
          if (d.holding.quantity > 0) {
            const isProfit = d.holding.pnl_percent >= 0;
            return isProfit ? [52, 158, 8, 255] : [255, 68, 68, 125]; // color-buy-medium or color-sell-medium
          }
          
          // previously held but not currently: subtle gray halo
          // if holding exists but quantity is 0, user previously held this token
          return [157, 157, 157, 100]; // color-text-muted
        },
        getLineWidth: 2, // 2px border
        lineWidthUnits: 'pixels', // ensure line width is in pixels
        getRadius: finalRadius + 4, // original radius + 2px gap (border adds 2px more)
        radiusUnits: 'pixels',
        pickable: false,
        autoHighlight: false,
      });

      const labelsData = tokensWithAgeAndHoldings.filter(
        d => (d.market_cap || 0) > MCAP_DOMAIN[1]
      );

      const textLayer = new TextLayer<EnrichedTokenData>({
        id: 'text-layer',
        data: labelsData,
        getPosition: d => {
          const phaseX = d.mint.charCodeAt(0) || 0;
          const jitterX = Math.sin(time * 2 + phaseX) * 1.5;
          const yPos = MCAP_DOMAIN[1];
          return [d.age! + RENDER_OFFSET + jitterX, yPos + RENDER_OFFSET, 0];
        },
        getText: d => {
          const value = currency === 'USD' ? d.market_cap_usd : d.market_cap;
          const prefix = currency === 'USD' ? '$' : '';
          return `${prefix}${formatLargeNumber(value || 0)}`;
        },
        getSize: 9,
        getColor: [255, 170, 0, 220],
        getAngle: 0,
        fontFamily: 'DM Sans, sans-serif',
        fontWeight: 600,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'top',
        getPixelOffset: [0, 10],
        updateTriggers: {
          getText: currency,
        },
      });

      // entry line and text for selected token with holdings
      const layers: any[] = [migrationLineLayer, migrationTextLayer, holdingsHaloLayer, scatterplotLayer, textLayer];
      
      const selectedTokenWithHolding = selectedTokenRef.current;
      if (selectedTokenWithHolding?.holding?.cost_basis_sol && selectedTokenWithHolding.holding.quantity > 0) {
        // calculate market cap at entry: (cost_basis_sol / quantity) * 1_000_000_000
        // assumes 1B token supply (same as price calculation)
        const entryPricePerToken = selectedTokenWithHolding.holding.cost_basis_sol / selectedTokenWithHolding.holding.quantity;
        const entryMarketCapSol = entryPricePerToken * 1_000_000_000;
        const entryYPos = Math.min(entryMarketCapSol, MCAP_DOMAIN[1]);

        const entryLineLayer = new LineLayer({
          id: 'entry-line',
          data: [{
            source: [AGE_DOMAIN[0], entryYPos + RENDER_OFFSET],
            target: [AGE_DOMAIN[1], entryYPos + RENDER_OFFSET]
          }],
          getSourcePosition: d => d.source,
          getTargetPosition: d => d.target,
          getColor: [52, 158, 8, 100], // color-buy-medium #349e08
          getWidth: 1,
        });

        const entryTextLayer = new TextLayer({
          id: 'entry-label',
          data: [{
            position: [AGE_DOMAIN[1] / 2, entryYPos + RENDER_OFFSET]
          }],
          getPosition: d => d.position,
          getText: () => 'ENTRY',
          getColor: [76, 175, 80, 150], // green #4CAF50
          getSize: 10,
          getPixelOffset: [0, 4],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'top',
          fontFamily: 'Gabarito, sans-serif',
          fontWeight: 400,
        });

        // insert entry layers before scatterplot layer
        layers.splice(3, 0, entryLineLayer, entryTextLayer);
      }

      setLayers(layers);

      animationFrame.current = requestAnimationFrame(frame);
    };
    
    frame();

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
    };
  }, [tokensRef, viewState, dimensions, currency, migrationThresholdUsd, atlasHoldingsMap, opacityMetric, selectedToken]);

  useEffect(() => {
    // prevent multiple animation loops
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    
    const cleanup = animate();
    return () => {
      if (cleanup) cleanup();
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
    };
  }, [animate]);

  return {
    layers,
    enrichedTokens,
  };
};

