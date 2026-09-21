const { ethers } = require('ethers');
const { BLOCKCHAIN } = require('../consts/index');
const { provider, ideaCoinContract } = require('./blockchain');

const { TOKEN_DECIMALS } = BLOCKCHAIN;

async function gasEstimateToEthFee(gasEstimate) {
  const gasPrice = await provider.getGasPrice();
  return ethers.utils.formatEther(gasEstimate.mul(gasPrice));
}

function assertAddress(address, label) {
  if (!address || !ethers.utils.isAddress(address)) {
    throw new Error(`Invalid ${label}`);
  }
}

async function estimateEthSendGas(walletAddress, to, amount) {
  assertAddress(to, 'destination address');
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    throw new Error('Invalid amount');
  }
  const weiAmount = ethers.utils.parseUnits(
    numAmount.toFixed(TOKEN_DECIMALS),
    'ether',
  );
  const gasEstimate = await provider.estimateGas({
    to,
    value: weiAmount,
    from: walletAddress,
  });
  return gasEstimateToEthFee(gasEstimate);
}

async function estimateRoyaltyCoinSendGas(
  walletAddress,
  transactionType,
  to,
  amount,
) {
  const decimals = await ideaCoinContract.decimals();
  const amountBN = ethers.utils.parseUnits(String(amount), decimals);

  if (transactionType === 'APPROVAL') {
    const approveSpender =
      to && ethers.utils.isAddress(to) ? to : walletAddress;
    const gasEstimate = await ideaCoinContract.estimateGas.approve(
      approveSpender,
      amountBN,
      { from: walletAddress },
    );
    return gasEstimateToEthFee(gasEstimate);
  }

  if (transactionType === 'SEND') {
    assertAddress(to, 'destination address');
    const gasEstimate = await ideaCoinContract.estimateGas.transfer(
      to,
      amountBN,
      { from: walletAddress },
    );
    return gasEstimateToEthFee(gasEstimate);
  }

  throw new Error('Invalid transaction type for RoyaltyCoins');
}

async function estimateWalletSendGas({
  walletAddress,
  assetType,
  transactionType,
  to,
  amount,
}) {
  assertAddress(walletAddress, 'wallet address');

  if (assetType === 'Ethereum') {
    return estimateEthSendGas(walletAddress, to, amount);
  }

  if (assetType === 'RoyaltyCoins') {
    return estimateRoyaltyCoinSendGas(
      walletAddress,
      transactionType,
      to,
      amount,
    );
  }

  throw new Error('Unsupported asset type for gas estimate');
}

module.exports = { estimateWalletSendGas };
