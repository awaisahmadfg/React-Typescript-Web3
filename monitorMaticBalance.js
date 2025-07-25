 monitorMaticBalance: async () => {
    try {
      const ownerMaticBalance = await provider.getBalance(wallet.address);
      console.log(
        `Checked owner's MATIC balance: ${ethers.utils.formatEther(
          ownerMaticBalance,
        )} MATIC`,
      );
      const { threshold } = await getLatestRewardIteration();
      if (ethers.utils.formatEther(ownerMaticBalance) >= threshold) {
        console.log('Threshold met. Checking eligible addresses...');
        const eligibleUsers = await _getEligibleAddresses(); // Get Users that have IdeaCoins > 0

        let totalRewardsDistributed =
          await ideaCoinContract.totalRewardsDistributed();
        totalRewardsDistributed = formatBalance(totalRewardsDistributed);

        const userShares = await Promise.all(
          eligibleUsers.map(async (user) => {
            const ideaBalance = ethers.utils.formatUnits(user.ideaCoins, 18);
            const userShare =
              (ideaBalance * threshold) / totalRewardsDistributed.toFixed(12);
            sendEmailViaQueue(user, userShare);
            return { id: user._id, address: user.walletAddress, userShare };
          }),
        );
        userShares.forEach(async (obj) => {
          await updateUser(obj.id, {
            $inc: { share: obj.userShare.toFixed(12) },
          });
        });

        const maticThreshold = (threshold * 125) / 100;
        await insertRewardIteration(maticThreshold);
        console.log(`New threshold is ${maticThreshold} MATIC`);
        return;
      } else {
        console.log('Threshold not met. No action taken.');
      }
    } catch (error) {
      console.error(ERRORS.MATIC_BALANCE_MONITORING_ERROR, error);
    }
  },
