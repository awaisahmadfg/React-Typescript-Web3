import React from 'react';
import { IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Caption } from 'components/common/StyledComponents';
import { formatRoyaltyFull } from 'helpers/formatRoyalty';
import {
  RC_SWAP_UI,
  RcSwapExecutePhase,
  RcSwapOutputToken
} from 'helpers/royaltyCoinSwap';
import { NUMBERS } from 'utilities/constants';
import { getSwapActionKind } from './SwapActionLabel';
import { SwapAmountCard } from './SwapAmountCard';
import { SwapModalFooter } from './SwapModalFooter';
import { rcSwapCaptionSx } from './styledComponents';

function formatRcBalance(
  balanceLoading: boolean,
  rcBalance: number | null
): string {
  if (balanceLoading) return '…';
  if (rcBalance === null) return '—';
  return formatRoyaltyFull(rcBalance, NUMBERS.SIX);
}

function formatOutputAmount(
  quoteLoading: boolean,
  hasInput: boolean,
  outputToken: RcSwapOutputToken,
  quoteAmountOut?: string
): string {
  if (quoteLoading && hasInput) return '…';
  if (quoteAmountOut) {
    return quoteAmountOut;
  }
  return '0';
}

const SwapDexCloseButton: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) =>
  visible ? (
    <IconButton
      onClick={onClose}
      size="small"
      sx={{
        position: 'absolute',
        right: 12,
        top: 12,
        color: 'rgba(255,255,255,0.95)'
      }}
      aria-label="Close"
    >
      <CloseIcon fontSize="small" />
    </IconButton>
  ) : null;

export type SwapDexViewProps = {
  onClose: () => void;
  modalLocked: boolean;
  amountRc: string;
  setAmountRc: React.Dispatch<React.SetStateAction<string>>;
  outputToken: RcSwapOutputToken;
  setOutputToken: React.Dispatch<React.SetStateAction<RcSwapOutputToken>>;
  quoteLoading: boolean;
  quoteAmountOut?: string;
  executing: boolean;
  executePhase: RcSwapExecutePhase;
  swapSuccess: boolean;
  canSwap: boolean;
  rcBalance: number | null;
  balanceLoading: boolean;
  rateLabel: string | null;
  quoteError?: string | null;
  txHash: string | null;
  approveTxHash: string | null;
  gasEstimateLabel: string | null;
  onMax: () => void;
  onSwap: () => void;
  slippagePercent: number;
  onSlippageChange: (_percent: number) => void;
  exceedsBalance: boolean;
};

export const SwapDexView: React.FC<SwapDexViewProps> = ({
  onClose,
  modalLocked,
  amountRc,
  setAmountRc,
  outputToken,
  setOutputToken,
  quoteLoading,
  quoteAmountOut,
  executing,
  executePhase,
  swapSuccess,
  canSwap,
  rcBalance,
  balanceLoading,
  rateLabel,
  quoteError,
  txHash,
  approveTxHash,
  gasEstimateLabel,
  onMax,
  onSwap,
  slippagePercent,
  onSlippageChange,
  exceedsBalance
}) => {
  const hasInput = Number(amountRc) > 0;
  const outputDisplay = formatOutputAmount(
    quoteLoading,
    hasInput,
    outputToken,
    quoteAmountOut
  );
  const actionKind = quoteError
    ? 'error'
    : getSwapActionKind(
        executing,
        executePhase,
        amountRc,
        quoteLoading,
        !!quoteError,
        exceedsBalance
      );
  const balanceLabel = formatRcBalance(balanceLoading, rcBalance);

  return (
    <>
      <SwapDexCloseButton visible={!modalLocked} onClose={onClose} />

      <Typography
        component="h2"
        sx={{ fontWeight: 800, fontSize: '1.25rem', mb: 0.5, pr: 4 }}
      >
        Withdraw
      </Typography>
      <Caption sx={{ ...rcSwapCaptionSx, display: 'block', mb: 1 }}>
        {RC_SWAP_UI.subtitle}
      </Caption>
      <Caption
        sx={{
          ...rcSwapCaptionSx,
          display: 'block',
          mb: 2,
          lineHeight: 1.45
        }}
      >
        {RC_SWAP_UI.description}
      </Caption>

      <SwapAmountCard
        amountRc={amountRc}
        setAmountRc={setAmountRc}
        outputToken={outputToken}
        setOutputToken={setOutputToken}
        quoteLoading={quoteLoading}
        outputDisplay={outputDisplay}
        balanceLabel={balanceLabel}
        rcBalance={rcBalance}
        onMax={onMax}
        inputsLocked={modalLocked}
      />

      <SwapModalFooter
        rateLabel={rateLabel}
        quoteLoading={quoteLoading}
        quoteError={quoteError}
        actionKind={actionKind}
        outputToken={outputToken}
        canSwap={canSwap}
        onSwap={onSwap}
        txHash={txHash}
        approveTxHash={approveTxHash}
        swapSuccess={swapSuccess}
        onDone={onClose}
        slippagePercent={slippagePercent}
        onSlippageChange={onSlippageChange}
        gasEstimateLabel={gasEstimateLabel}
        executePhase={executePhase}
      />
    </>
  );
};
