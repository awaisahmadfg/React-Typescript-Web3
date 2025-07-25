  distributeMaticRewards: async (req, res) => {
    try {
      const { walletAddress: address, share: amount } = await mongoose
        .model(MODALS.PROFILE)
        .findOne({ _id: req.user.id });

      if (!address || !amount) {
        throw new Error(ERRORS.INVALID_PARAMETER);
      }

      if (!ethers.utils.isAddress(address)) {
        throw new Error(ERRORS.INVALID_ADDRESS);
      }

      const maticAmount = ethers.utils.parseUnits(amount.toString(), 18);
      if (maticAmount.lte(0)) {
        throw new Error(ERRORS.INVALID_AMOUNT);
      }

      const ideaBalance = await ideaCoinContract.balanceOf(address);
      if (ideaBalance.eq(0)) {
        throw new Error(ERRORS.IDEACOINS_INSUFFICIENT);
      }

      const ownerMaticBalance = await maticContract.balanceOf(wallet.address);
      if (maticAmount.gte(ownerMaticBalance)) {
        throw new Error(ERRORS.MATIC_INSUFFICIENT);
      }

      pusher.trigger(
        `${CHANNELS.DISTRIBUTE_REWARD}-${address}`,
        EVENTS.LOADING,
        {
          type: COMMON.INFO,
          message: COMMON.REWARDS_INITIATED,
        },
      );
      async function approveMaticSpend(owner, spender, amount) {
        const tx = await maticContract.connect(wallet).approve(spender, amount);
        await tx.wait();
      }

      await approveMaticSpend(
        wallet.address,
        ideaCoinContract.address,
        maticAmount,
      );

      // Distribute MATIC rewards
      pusher.trigger(
        `${CHANNELS.DISTRIBUTE_REWARD}-${address}`,
        EVENTS.LOADING,
        {
          type: COMMON.INFO,
          message: COMMON.FEW_MORE_MOMENTS,
        },
      );
      const tx = await ideaCoinContract.distributeMaticReward(
        address,
        maticAmount,
      );

      await tx.wait();

      pusher.trigger(
        `${CHANNELS.DISTRIBUTE_REWARD}-${address}`,
        EVENTS.LOADING,
        {
          type: COMMON.SUCCESS,
          message: COMMON.REWARDS_TRANSFERED,
        },
      );

      await updateUser(req.user.id, { share: 0 });

      res.json({
        success: true,
        message: COMMON.MATIC_REWARD_DISTRIBUTED,
      });
    } catch (error) {
      console.error(ERRORS.TRANSACTION_FAILED, error);
      return res.status(500).json({
        success: false,
        message: `${ERRORS.TRANSACTION_FAILED}: ${error.message}`,
      });
    }
  },
