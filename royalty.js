const ethers = require('ethers');

const send = async (address, amount) => {
  const provider = ethers.getDefaultProvider(process.env.ROYALTY_NETWORK);
  // const provider = new ethers.providers.JsonRpcProvider(
  //   process.env.ROYALTY_NETWORK_RPC,
  // );
  const wallet = new ethers.Wallet(process.env.ROYALTY_KEY, provider);

  const res = await wallet.sendTransaction({
    to: address,
    value: ethers.utils.parseEther(String(amount)),
    gasLimit: 100000,
  });

  return res;
};

module.exports = {
  send,
};
