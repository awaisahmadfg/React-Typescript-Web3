const { ethers } = require('ethers');
const { BLOCKCHAIN, ERRORS, COMMON, MODALS } = require('../consts/index');

const {
  EIGHT,
  TOKEN_DECIMALS,
  DEFAULT_USDT_DECIMALS,
  ZERO_ADDRESS,
  RC_BALANCE_DISPLAY_DECIMALS,
} = BLOCKCHAIN;
const { getIdeaCoinPriceUsd } = require('./ideaCoinPriceUsd');
const { CURRENCY, COINBASE_API_URL } = process.env;
const emailService = require('./email');
const { mongoose } = require('mongoose');
const usdtAbi = require('../contract/USDTToken.json');

const {
  INFURA_URL: providerUrl,
  PRIVATE_KEY: privateKey,
  IDEACOIN_CONTRACT_ADDRESS: IdeaContractAddress,
  USDT_CONTRACT_ADDRESS: usdtContractAddress,
} = process.env;

const provider = new ethers.providers.JsonRpcProvider(providerUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const ideaCoinContract = new ethers.Contract(
  IdeaContractAddress,
  require('../contract/RoyaltyCoin.json'),
  wallet,
);
const usdtContract = new ethers.Contract(
  usdtContractAddress,
  usdtAbi,
  provider,
);

const createWallet = async () => {
  try {
    const newWallet = ethers.Wallet.createRandom();
    const walletAddress = newWallet.address;
    const Passphrase = newWallet.mnemonic.phrase;
    const newPrivateKey = newWallet.privateKey;

    return {
      success: true,
      walletAddress,
      Passphrase,
      privateKey: newPrivateKey,
    };
  } catch (error) {
    console.error(ERRORS.FAILED_TO_CREATE_WALLET, error);
    throw new Error(ERRORS.FAILED_TO_CREATE_WALLET);
  }
};

const fetchLivePrices = async () => {
  const url = COINBASE_API_URL;
  const currencies = ['USD', 'BTC', 'ETH'];

  try {
    const response = await fetch(`${url}?currency=${CURRENCY}`);
    const data = await response.json();
    const rates = data.data.rates;

    const results = {};
    currencies.forEach((currency) => {
      if (rates[currency]) {
        results[currency] = parseFloat(
          parseFloat(rates[currency]).toFixed(EIGHT),
        );
      }
    });

    return results;
  } catch (error) {
    console.error(ERRORS.FETCHING_LIVE_PRICES, error.message);
  }
};

const convertUsdtToCurrency = async (usdtAmount) => {
  try {
    const prices = await fetchLivePrices();
    return {
      usd: usdtAmount * prices.USD,
      btc: usdtAmount * prices.BTC,
      eth: usdtAmount * prices.ETH,
    };
  } catch (error) {
    console.error(ERRORS.FAILED_TO_CONVERT_MATIC, error);
  }
};

async function sendClaimYourRewardEmail(user, share) {
  try {
    const currencies = await convertUsdtToCurrency(share);
    await emailService.sendClaimYourRewardEmail({
      email: user.email,
      recipientFirstName: user.firstName | user.username,
      user: user.firstName || user.username || user.email,
      userLinkUrl: `${process.env.CLIENT_HOST}/${COMMON.PROFILES}/${user.key}`,
      rewardAmount: share,
      amountUSD: currencies.usd,
      amountBTC: currencies.btc,
      amountETH: currencies.eth,
      mainImage: user?.files[0]?.url,
    });
  } catch (error) {
    console.error(ERRORS.MAIL_SENDING_ERROR, error.message);
  }
}

async function updateUser(id, updateObj) {
  const query = { _id: id };
  try {
    const result = await mongoose
      .model(MODALS.PROFILE)
      .findOneAndUpdate(query, updateObj, { new: true });

    if (!result) {
      console.error(`Document with id ${id} not found`);
      return null;
    }
    return result;
  } catch (error) {
    console.error(`Error updating document with id ${id}:`, error);
    throw error;
  }
}

async function getOwnerUsdtBalance() {
  const balanceRaw = await usdtContract.balanceOf(wallet.address);
  const usdtBalance = parseFloat(
    ethers.utils.formatUnits(balanceRaw, DEFAULT_USDT_DECIMALS),
  );

  return {
    usdtBalance,
    walletAddress: wallet.address,
  };
}

async function getRoyaltyCoinOnChainBalance(walletAddress) {
  const address = ethers.utils.getAddress(String(walletAddress).trim());
  const balanceRaw = await ideaCoinContract.balanceOf(address);
  const balance = parseFloat(
    parseFloat(ethers.utils.formatUnits(balanceRaw, TOKEN_DECIMALS)).toFixed(
      RC_BALANCE_DISPLAY_DECIMALS,
    ),
  );

  return {
    walletAddress: address,
    balance: Number.isNaN(balance) ? 0 : balance,
    balanceRaw: balanceRaw.toString(),
  };
}

async function getUsdtOnChainBalanceForAddress(walletAddress) {
  const address = ethers.utils.getAddress(String(walletAddress).trim());
  const balanceRaw = await usdtContract.balanceOf(address);
  const balance = parseFloat(
    ethers.utils.formatUnits(balanceRaw, DEFAULT_USDT_DECIMALS),
  );

  return {
    walletAddress: address,
    balance: Number.isNaN(balance) ? 0 : balance,
    balanceRaw: balanceRaw.toString(),
  };
}

async function getEthOnChainBalanceForAddress(walletAddress) {
  const address = ethers.utils.getAddress(String(walletAddress).trim());
  const balanceRaw = await provider.getBalance(address);
  const balance = parseFloat(ethers.utils.formatEther(balanceRaw));

  return {
    walletAddress: address,
    balance: Number.isNaN(balance) ? 0 : balance,
    balanceRaw: balanceRaw.toString(),
  };
}

function isEthPaymentToken(paymentToken) {
  return !paymentToken || paymentToken === ZERO_ADDRESS;
}

function resolvePaymentTokenAddress(paymentToken) {
  if (!paymentToken || isEthPaymentToken(paymentToken)) {
    return ZERO_ADDRESS;
  }
  return paymentToken;
}

function formatListingPrice(listPrice, paymentToken) {
  const decimals = isEthPaymentToken(paymentToken)
    ? TOKEN_DECIMALS
    : DEFAULT_USDT_DECIMALS;
  return ethers.utils.formatUnits(listPrice, decimals);
}

function parseRequestBigNumber(value) {
  if (ethers.BigNumber.isBigNumber(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    const hex = value._hex || value.hex;
    if (hex) {
      return ethers.BigNumber.from(hex);
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return ethers.BigNumber.from(value);
  }
  throw new Error('Invalid wei amount');
}

async function ensureUsdtAllowance(signer, spender, amount) {
  const usdtWithSigner = usdtContract.connect(signer);
  const allowance = await usdtWithSigner.allowance(signer.address, spender);
  if (allowance.gte(amount)) {
    return null;
  }
  const approveTx = await usdtWithSigner.approve(spender, amount);
  return approveTx.wait();
}

module.exports = {
  createWallet,
  fetchLivePrices,
  convertUsdtToCurrency,
  sendClaimYourRewardEmail,
  getIdeaCoinPriceUsd,
  getOwnerUsdtBalance,
  getRoyaltyCoinOnChainBalance,
  getUsdtOnChainBalanceForAddress,
  getEthOnChainBalanceForAddress,
  isEthPaymentToken,
  resolvePaymentTokenAddress,
  formatListingPrice,
  parseRequestBigNumber,
  ensureUsdtAllowance,
  ZERO_ADDRESS,
  DEFAULT_USDT_DECIMALS,
  TOKEN_DECIMALS,
  provider,
  wallet,
  ideaCoinContract,
  usdtContract,
  usdtContractAddress,
  updateUser,
};
