import Config from 'config/config';

/** Must match backend RPC network (Sepolia vs mainnet). */
export function getRcSwapChainId(): number {
  return Config.ETH_NETWORK === 'mainnet' ? 1 : Config.RPC_TEST_CHAIN_ID;
}

export function rcSwapNetworkLabel(): string {
  return Config.ETH_NETWORK === 'mainnet' ? 'Ethereum Mainnet' : 'Sepolia';
}
