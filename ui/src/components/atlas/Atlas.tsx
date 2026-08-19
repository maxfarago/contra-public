import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import '../../styles/components/atlas.css';
import { useAtlasWebSocket } from '../../hooks/atlas/useAtlasWebSocket';
import { useAtlasViewState } from '../../hooks/atlas/useAtlasViewState';
import { useDeckGLLayers } from '../../hooks/atlas/useDeckGLLayers';
import { AtlasHUD } from './AtlasHUD';
import { AtlasChart } from './AtlasChart';
import { OpacityMetric, EnrichedTokenData } from './types';
import { MIGRATION_THRESHOLD_SOL } from './constants';
import Modal from '../ui/Modal';

const INACTIVITY_TIMEOUT_MS = 60000 * 60 * 3; // 3 hours

const Atlas = () => {
  const [opacityMetric] = useState<OpacityMetric>('volume');
  const [selectedToken, setSelectedToken] = useState<EnrichedTokenData | null>(null);
  const selectedTokenMintRef = useRef<string | null>(null);
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { tokensRef, tokenCount, migrationThresholdUsd, isPausedByInactivity, isWalletHot, pause, resume } = useAtlasWebSocket();
  
  // calculate migrated token count - update when tokenCount changes
  const [migratedTokenCount, setMigratedTokenCount] = useState(0);
  useEffect(() => {
    const tokens = Array.from(tokensRef.current.values());
    setMigratedTokenCount(tokens.filter(token => token.status?.toLowerCase() === 'migrated').length);
  }, [tokenCount]);

  // calculate tokens above graduation market cap - update when tokenCount changes
  const [aboveGraduationCount, setAboveGraduationCount] = useState(0);
  useEffect(() => {
    const tokens = Array.from(tokensRef.current.values());
    setAboveGraduationCount(tokens.filter(token => (token.market_cap ?? 0) > MIGRATION_THRESHOLD_SOL).length);
  }, [tokenCount]);

  // calculate mayhem token count - update when tokenCount changes
  const [mayhemTokenCount, setMayhemTokenCount] = useState(0);
  useEffect(() => {
    const tokens = Array.from(tokensRef.current.values());
    setMayhemTokenCount(tokens.filter(token => token.is_mayhem_mode).length);
  }, [tokenCount]);

  const { viewState, viewport, dimensions, containerRef, onViewStateChange } = useAtlasViewState();
  
  // handle hover selection - only changes which token is selected
  const handleHover = useCallback((token: EnrichedTokenData | null) => {
    if (token) {
      selectedTokenMintRef.current = token.mint;
      setSelectedToken(token);
    } else {
      selectedTokenMintRef.current = null;
      setSelectedToken(null);
    }
  }, []);

  // handle data updates - only updates data for currently selected token
  const handleTokenDataUpdate = useCallback((updatedToken: EnrichedTokenData | null) => {
    if (updatedToken) {
      // only update if this is still the selected token
      if (selectedTokenMintRef.current === updatedToken.mint) {
        setSelectedToken((prevToken) => {
          // preserve holdings from previous token if update doesn't include them
          // (shouldn't happen, but defensive programming)
          if (prevToken?.holding && !updatedToken.holding) {
            return { ...updatedToken, holding: prevToken.holding };
          }
          return updatedToken;
        });
      }
    } else {
      // token was deleted, clear selection
      selectedTokenMintRef.current = null;
      setSelectedToken(null);
    }
  }, []);

  const { layers } = useDeckGLLayers({
    tokensRef,
    viewState,
    dimensions,
    migrationThresholdUsd,
    opacityMetric,
    selectedToken,
    onSelectedTokenUpdate: handleTokenDataUpdate,
  });

  useEffect(() => {
    const resetInactivityTimer = () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }

      if (!isPausedByInactivity && document.visibilityState === 'visible') {
        inactivityTimeoutRef.current = setTimeout(() => {
          pause();
        }, INACTIVITY_TIMEOUT_MS);
      }
    };

    const handleMouseMove = () => {
      resetInactivityTimer();
    };

    const handleMouseDown = () => {
      resetInactivityTimer();
    };

    const handleKeyDown = () => {
      resetInactivityTimer();
    };

    resetInactivityTimer();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPausedByInactivity, pause]);

  const handleResume = () => {
    resume();
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    inactivityTimeoutRef.current = setTimeout(() => {
      pause();
    }, INACTIVITY_TIMEOUT_MS);
  };

  return (
    <div className="app-container">
      <AtlasHUD 
        selectedToken={selectedToken}
        tokenCount={tokenCount}
        migratedTokenCount={migratedTokenCount}
        aboveGraduationCount={aboveGraduationCount}
        mayhemTokenCount={mayhemTokenCount}
        migrationThresholdUsd={migrationThresholdUsd}
        isPausedByInactivity={isPausedByInactivity}
        isWalletHot={isWalletHot}
        onTokenChange={setSelectedToken}
      />
      <AtlasChart
        layers={layers}
        viewState={viewState}
        viewport={viewport}
        dimensions={dimensions}
        containerRef={containerRef}
        onViewStateChange={onViewStateChange}
        onHover={handleHover}
      />
      <Modal
        isOpen={isPausedByInactivity}
        onClose={handleResume}
        size="sm"
        closeOnOverlayClick={false}
        closeOnEscape={false}
      >
        <div style={{ padding: 'var(--space-4)' }}>
          <h2 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)' }}>
            Stream Paused
          </h2>
          <p style={{ marginBottom: 'var(--space-6)', color: 'var(--color-text-muted)', lineHeight: 'var(--line-height-relaxed)' }}>
            We've turned off the firehose while you're away. No point in burning bandwidth 🔥
          </p>
          <button
            className="btn"
            onClick={handleResume}
            style={{ width: '100%' }}
          >
            Reconnect
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Atlas;
