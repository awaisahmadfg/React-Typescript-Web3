import { useState } from 'react';
import useMetaMask from '../hooks/useMetaMask';

const MetaMaskButton = () => {
  const { account, chainId, isConnected, isInstalled, isLoading, error, connect, disconnect } = useMetaMask();
  const [showDropdown, setShowDropdown] = useState(false);

  // Format address to show first 6 and last 4 characters
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Get network name from chain ID
  const getNetworkName = (chainId) => {
    const networks = {
      '1': 'Ethereum Mainnet',
      '3': 'Ropsten',
      '4': 'Rinkeby',
      '5': 'Goerli',
      '11155111': 'Sepolia',
      '1337': 'Localhost',
      '5777': 'Ganache',
    };
    return networks[chainId] || `Chain ID: ${chainId}`;
  };

  const handleConnect = async () => {
    await connect();
  };

  const handleDisconnect = () => {
    disconnect();
    setShowDropdown(false);
  };

  if (!isInstalled) {
    return (
      <button
        onClick={handleConnect}
        className="btn bg-yellow-500 hover:bg-yellow-600 text-white"
        title="Install MetaMask"
      >
        Install MetaMask
      </button>
    );
  }

  if (isLoading) {
    return (
      <button className="btn" disabled>
        Loading...
      </button>
    );
  }

  if (error && !isConnected) {
    return (
      <div className="relative">
        <button
          onClick={handleConnect}
          className="btn bg-red-500 hover:bg-red-600 text-white"
          title={error}
        >
          Connect Wallet
        </button>
        {error && (
          <div className="absolute top-full mt-2 right-0 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm whitespace-nowrap z-50">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (isConnected && account) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="btn bg-green-500 hover:bg-green-600 text-white flex items-center gap-2"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 8V12L15 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {formatAddress(account)}
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            ></div>
            <div className="absolute top-full mt-2 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[280px]">
              <div className="p-4 border-b border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Connected Account</p>
                <p className="text-sm font-mono font-semibold break-all">
                  {account}
                </p>
              </div>
              <div className="p-4 border-b border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Network</p>
                <p className="text-sm font-semibold">
                  {getNetworkName(chainId || '1')}
                </p>
              </div>
              <div className="p-2">
                <button
                  onClick={handleDisconnect}
                  className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="btn bg-primary-600 hover:bg-primary-700 text-white"
    >
      Connect Wallet
    </button>
  );
};

export default MetaMaskButton;

