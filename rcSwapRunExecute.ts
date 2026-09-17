import dataProvider from 'dataPrvider';
import { slippagePercentToBps } from 'helpers/rcSwapSlippage';
import {
  RcSwapExecuteResult,
  RcSwapGasEstimate,
  RcSwapOutputToken
} from 'helpers/royaltyCoinSwap';

export async function runRcSwapApproveAndExecute(params: {
  walletAddress: string;
  amountRc: string;
  outputToken: RcSwapOutputToken;
  chainId: number;
  slippagePercent: number;
  gasEstimate: RcSwapGasEstimate | null;
  onPhase: (_phase: 'approving' | 'swapping') => void;
}): Promise<{
  swapHash: string | null;
  approveHash: string | null;
  executeResult: RcSwapExecuteResult | null;
}> {
  const slippageBps = slippagePercentToBps(params.slippagePercent);
  const body = {
    amountRc: params.amountRc,
    outputToken: params.outputToken,
    walletAddress: params.walletAddress,
    chainId: params.chainId,
    slippageBps
  };

  let approveHash: string | null = null;
  const needsApproval = params.gasEstimate?.needsApproval ?? true;

  if (needsApproval) {
    params.onPhase('approving');
    const approveResult = await dataProvider.approveRoyaltyCoinForSwap(body);
    if (approveResult?.success === false) {
      throw new Error(
        typeof approveResult?.message === 'string'
          ? approveResult.message
          : 'RoyaltyCoin approval failed'
      );
    }
    if (approveResult?.transactionHash) {
      approveHash = approveResult.transactionHash;
    }
  }

  params.onPhase('swapping');
  const result = await dataProvider.executeRoyaltyCoinSwap(body);
  const executeResult =
    result?.transactionHash !== null && result?.transactionHash !== undefined
      ? (result as RcSwapExecuteResult)
      : null;
  return {
    swapHash: result?.transactionHash ?? null,
    approveHash,
    executeResult
  };
}
