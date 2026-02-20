#!/usr/bin/env node

/**
 * One-time script to create an IdeaCoin/USDT liquidity pool on Sepolia (Uniswap V2).
 * USDT address comes from packages/backend/src/consts/index.js (no env).
 *
 * Sepolia: Test USDT address is in consts (SEPOLIA_TEST_USDT_ADDRESS)
 *          Then mint test USDT to your wallet and run this script. Mainnet is not supported by Uniswap UI for testnets.
 * Mainnet: Create the pair and add liquidity via Uniswap UI; do not use this script for mainnet.
 *
 * Usage (Sepolia only):
 *   node scripts/createIdeaCoinPool.js --idea 100 --usdt 10
 *
 * Env: INFURA_URL, PRIVATE_KEY, IDEACOIN_CONTRACT_ADDRESS (Sepolia).
 */

/* eslint-disable no-console */
const { config: loadEnv } = require('dotenv');
const { resolve } = require('path');
const { ethers } = require('ethers');

const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = resolve(__dirname, '../env/.env.' + NODE_ENV);
loadEnv({ path: envPath });

const { BLOCKCHAIN_CHAINS, CHAIN_IDS } = require('../src/consts/index');

const UNISWAP_V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function createPair(address tokenA, address tokenB) external returns (address pair)',
];
const UNISWAP_V2_ROUTER_ABI = [
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
];
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

const USDT_DECIMALS = 6;
const ZERO = '0x0000000000000000000000000000000000000000';

function parseArgs() {
  const args = process.argv.slice(2);
  let ideaAmount = '0';
  let usdtAmount = '0';
  let network = 'sepolia';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--idea' && args[i + 1]) ideaAmount = args[++i];
    else if (args[i] === '--usdt' && args[i + 1]) usdtAmount = args[++i];
    else if (args[i] === '--network' && args[i + 1])
      network = args[++i].toLowerCase();
  }
  return { ideaAmount, usdtAmount, network };
}

const IDEA_COIN_DECIMALS = 18;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const DEADLINE_MINUTES = 20;

function getNetworkConfig(network) {
  if (network === 'mainnet') {
    console.error(
      'Mainnet: create the IdeaCoin/USDT pair and add liquidity via Uniswap UI. This script is for Sepolia only.',
    );
    return { chainId: null, chainConfig: null };
  }
  const chainId = CHAIN_IDS.SEPOLIA;
  const chainConfig = BLOCKCHAIN_CHAINS[chainId];
  if (!chainConfig) return { chainId: null, chainConfig: null };
  const usdtAddress = chainConfig.usdtAddress;
  if (
    !usdtAddress ||
    usdtAddress === ZERO ||
    usdtAddress.toLowerCase() === ZERO.toLowerCase()
  ) {
    console.error(
      'Set Sepolia test USDT in packages/backend/src/consts/index.js:',
    );
    console.error(
      '  1. Deploy scripts/contracts/TestUSDT.sol on Remix (Injected Provider, Sepolia).',
    );
    console.error(
      '  2. Set SEPOLIA_TEST_USDT_ADDRESS in consts to the deployed contract address.',
    );
    return { chainId: null, chainConfig: null };
  }
  return { chainId, chainConfig: { ...chainConfig, usdtAddress } };
}

function requireEnv(providerUrl, privateKey, ideaCoinAddress) {
  if (!providerUrl || !privateKey || !ideaCoinAddress) {
    console.error(
      'Missing INFURA_URL, PRIVATE_KEY, or IDEACOIN_CONTRACT_ADDRESS in env (Sepolia).',
    );
    process.exit(1);
  }
}

async function ensurePairExists(factory, ideaCoinAddress, usdtAddress) {
  const pairAddress = await factory.getPair(ideaCoinAddress, usdtAddress);
  const needsCreate =
    !pairAddress ||
    pairAddress === ZERO ||
    pairAddress.toLowerCase() === ZERO.toLowerCase();

  if (needsCreate) {
    console.log('Creating IDEA/USDT pair...');
    const tx = await factory.createPair(ideaCoinAddress, usdtAddress);
    await tx.wait();
    const newPair = await factory.getPair(ideaCoinAddress, usdtAddress);
    console.log('Pair created:', newPair);
    return newPair;
  }
  console.log('Pair already exists:', pairAddress);
  return pairAddress;
}

function checkBalances(
  ideaCoin,
  usdt,
  wallet,
  ideaWei,
  usdtWei,
  ideaAmount,
  usdtAmount,
) {
  return Promise.all([
    ideaCoin.balanceOf(wallet.address),
    usdt.balanceOf(wallet.address),
  ]).then(([ideaBalance, usdtBalance]) => {
    if (ideaBalance.lt(ideaWei)) {
      console.error(
        'Insufficient IdeaCoin. Have:',
        ethers.utils.formatUnits(ideaBalance, IDEA_COIN_DECIMALS),
        'need:',
        ideaAmount,
      );
      process.exit(1);
    }
    if (usdtBalance.lt(usdtWei)) {
      console.error(
        'Insufficient USDT. Have:',
        ethers.utils.formatUnits(usdtBalance, USDT_DECIMALS),
        'need:',
        usdtAmount,
      );
      process.exit(1);
    }
  });
}

async function ensureApprovals(
  wallet,
  routerAddress,
  ideaCoin,
  usdt,
  ideaWei,
  usdtWei,
) {
  const [ideaAllowance, usdtAllowance] = await Promise.all([
    ideaCoin.allowance(wallet.address, routerAddress),
    usdt.allowance(wallet.address, routerAddress),
  ]);
  const toApprove = [];
  if (ideaAllowance.lt(ideaWei))
    toApprove.push({ token: ideaCoin, name: 'IdeaCoin' });
  if (usdtAllowance.lt(usdtWei)) toApprove.push({ token: usdt, name: 'USDT' });
  const approvals = toApprove.map(({ token, name }) => {
    console.log('Approving', name, 'for Router...');
    return token
      .approve(routerAddress, ethers.constants.MaxUint256)
      .then((tx) => tx.wait());
  });
  if (approvals.length) {
    await Promise.all(approvals);
    console.log('Approved.');
  }
}

async function main() {
  const { ideaAmount, usdtAmount, network } = parseArgs();
  const ideaWei = ethers.utils.parseUnits(ideaAmount, IDEA_COIN_DECIMALS);
  const usdtWei = ethers.utils.parseUnits(usdtAmount, USDT_DECIMALS);

  if (ideaWei.isZero() || usdtWei.isZero()) {
    console.error(
      'Usage: node scripts/createIdeaCoinPool.js --idea <amount> --usdt <amount>',
    );
    console.error(
      'Example: node scripts/createIdeaCoinPool.js --idea 100 --usdt 10',
    );
    process.exit(1);
  }

  const providerUrl = process.env.INFURA_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const ideaCoinAddress = process.env.IDEACOIN_CONTRACT_ADDRESS;
  requireEnv(providerUrl, privateKey, ideaCoinAddress);

  const { chainId, chainConfig } = getNetworkConfig(network);
  if (!chainId || !chainConfig) {
    process.exit(1);
  }

  const factoryAddress =
    process.env.UNISWAP_V2_FACTORY_ADDRESS ||
    chainConfig.uniswapV2FactoryAddress;
  const routerAddress =
    process.env.UNISWAP_V2_ROUTER_ADDRESS || chainConfig.uniswapV2RouterAddress;
  const usdtAddress = chainConfig.usdtAddress;

  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const ideaCoin = new ethers.Contract(ideaCoinAddress, ERC20_ABI, wallet);
  const usdt = new ethers.Contract(usdtAddress, ERC20_ABI, wallet);
  const factory = new ethers.Contract(
    factoryAddress,
    UNISWAP_V2_FACTORY_ABI,
    wallet,
  );
  const router = new ethers.Contract(
    routerAddress,
    UNISWAP_V2_ROUTER_ABI,
    wallet,
  );

  await ensurePairExists(factory, ideaCoinAddress, usdtAddress);
  await checkBalances(
    ideaCoin,
    usdt,
    wallet,
    ideaWei,
    usdtWei,
    ideaAmount,
    usdtAmount,
  );
  await ensureApprovals(
    wallet,
    routerAddress,
    ideaCoin,
    usdt,
    ideaWei,
    usdtWei,
  );

  const deadline =
    Math.floor(Date.now() / MS_PER_SECOND) +
    SECONDS_PER_MINUTE * DEADLINE_MINUTES;
  console.log(
    'Adding liquidity:',
    ideaAmount,
    'IdeaCoin +',
    usdtAmount,
    'USDT...',
  );
  const tx = await router.addLiquidity(
    ideaCoinAddress,
    usdtAddress,
    ideaWei,
    usdtWei,
    0,
    0,
    wallet.address,
    deadline,
  );
  const receipt = await tx.wait();
  console.log('Liquidity added. Tx:', receipt.transactionHash);
  console.log(
    'Done. ideaCoinPrice API should return a non-zero price when called with chainId=',
    chainId,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
