import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

const useMetaMask = () => {
  const [state, setState] = useState({
    account: null,
    chainId: null,
    isConnected: false,
    isInstalled: false,
    isLoading: true,
    error: null,
  });

  // Check if MetaMask is installed
  const checkMetaMask = useCallback(() => {
    const isInstalled = typeof window !== 'undefined' && 
                       window.ethereum !== undefined && 
                       window.ethereum.isMetaMask === true;
    
    setState(prev => ({ ...prev, isInstalled, isLoading: false }));
    return isInstalled;
  }, []);

  // Get current account and chain ID
  const getAccountAndChain = useCallback(async () => {
    if (!window.ethereum) {
      setState(prev => ({ 
        ...prev, 
        isConnected: false, 
        account: null, 
        chainId: null,
        isLoading: false 
      }));
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await provider.listAccounts();
      const network = await provider.getNetwork();

      if (accounts.length > 0) {
        setState(prev => ({
          ...prev,
          isConnected: true,
          account: accounts[0],
          chainId: network.chainId.toString(),
          error: null,
          isLoading: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          isConnected: false,
          account: null,
          chainId: network.chainId.toString(),
          isLoading: false,
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to get account',
        isConnected: false,
        account: null,
        isLoading: false,
      }));
    }
  }, []);

  // Connect to MetaMask
  const connect = useCallback(async () => {
    if (!checkMetaMask()) {
      setState(prev => ({
        ...prev,
        error: 'MetaMask is not installed. Please install MetaMask to continue.',
        isLoading: false,
      }));
      // Open MetaMask installation page
      window.open('https://metamask.io/download/', '_blank');
      return false;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Request account access
      await provider.send('eth_requestAccounts', []);
      
      // Get accounts and network
      const accounts = await provider.listAccounts();
      const network = await provider.getNetwork();

      if (accounts.length > 0) {
        setState(prev => ({
          ...prev,
          isConnected: true,
          account: accounts[0],
          chainId: network.chainId.toString(),
          isLoading: false,
          error: null,
        }));
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isConnected: false,
          account: null,
          isLoading: false,
          error: 'No accounts found',
        }));
        return false;
      }
    } catch (error) {
      let errorMessage = 'Failed to connect to MetaMask';
      
      if (error.code === 4001) {
        errorMessage = 'Please connect to MetaMask';
      } else if (error.code === -32002) {
        errorMessage = 'Connection request already pending';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        isConnected: false,
        account: null,
      }));
      return false;
    }
  }, [checkMetaMask]);

  // Disconnect from MetaMask
  const disconnect = useCallback(() => {
    setState(prev => ({
      ...prev,
      isConnected: false,
      account: null,
      error: null,
    }));
  }, []);

  // Handle account changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        // User disconnected their account
        setState(prev => ({
          ...prev,
          isConnected: false,
          account: null,
        }));
      } else {
        // User switched accounts
        setState(prev => ({
          ...prev,
          isConnected: true,
          account: accounts[0],
          error: null,
        }));
      }
    };

    // Handle chain changes
    const handleChainChanged = (chainId) => {
      const chainIdDecimal = parseInt(chainId, 16).toString();
      setState(prev => ({
        ...prev,
        chainId: chainIdDecimal,
      }));
      // Optionally reload page on chain change (recommended by MetaMask)
      // window.location.reload();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  // Initialize on mount
  useEffect(() => {
    checkMetaMask();
    getAccountAndChain();
  }, [checkMetaMask, getAccountAndChain]);

  return {
    ...state,
    connect,
    disconnect,
    refresh: getAccountAndChain,
  };
};

export default useMetaMask;



