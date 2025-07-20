export const getTransactions = async (address: string, type: string) => {
  let url = '';
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-API-Key': Config.MORALIS_API_KEY
    }
  };
  if (type === ASSET_TYPES.MATIC) {
    url = `${Config.MORALIS_API_URL}/${address}?${Constants.CHAIN}=${Config.NEXT_PUBLIC_WALLET_NETWORK}`;
  } else if (type === ASSET_TYPES.IDEACOINS) {
    url = `${Config.MORALIS_API_URL}/${address}/${Constants.ERC20}/${Constants.TRANSFERS}?${Constants.CHAIN}=${Config.NEXT_PUBLIC_WALLET_NETWORK}&type=both`;
  } else if (type === ASSET_TYPES.NFT) {
    url = `${Config.MORALIS_API_URL}/${address}/${Constants.NFT_TEXT}/${Constants.TRANSFERS}?${Constants.CHAIN}=${Config.NEXT_PUBLIC_WALLET_NETWORK}`;
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${Constants.ERROR}: ${response.status}`);
  }
  return response.json();
};
