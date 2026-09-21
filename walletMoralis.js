const {
  MORALIS_API_KEY,
  MORALIS_API_URL = 'https://deep-index.moralis.io/api/v2',
  REWARDS_NETWORK,
  ROYALTY_NETWORK,
  USDT_CONTRACT_ADDRESS,
} = process.env;

const WALLET_CHAIN = REWARDS_NETWORK || ROYALTY_NETWORK || 'sepolia';

const ASSET_MORALIS_PATH = {
  Ethereum: (address) => `${address}?chain=${WALLET_CHAIN}`,
  RoyaltyCoins: (address) =>
    `${address}/erc20/transfers?chain=${WALLET_CHAIN}&type=both`,
  'Patent Tokens': (address) =>
    `${address}/nft/transfers?chain=${WALLET_CHAIN}`,
  USDT: (address) =>
    `${address}/erc20/transfers?chain=${WALLET_CHAIN}&contract_addresses[]=${USDT_CONTRACT_ADDRESS}`,
};

async function fetchWalletTransactionsFromMoralis(walletAddress, assetType) {
  if (!MORALIS_API_KEY) {
    throw new Error('MORALIS_API_KEY is not configured');
  }

  const buildPath = ASSET_MORALIS_PATH[assetType];
  if (!buildPath) {
    throw new Error('Invalid asset type for transaction history');
  }

  const url = `${MORALIS_API_URL}/${buildPath(walletAddress)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-API-Key': MORALIS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Moralis error: ${response.status}`);
  }

  return response.json();
}

module.exports = { fetchWalletTransactionsFromMoralis };
