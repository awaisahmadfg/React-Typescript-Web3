const { ethers } = require('ethers');
const { mongoose } = require('mongoose');
const { MODALS, COMMON } = require('../consts');
const { applicationDal, profileDal } = require('../dal');
const { provider, wallet } = require('../helpers/blockchain');
const { handleNewNotification } = require('../helpers/notification');
const { childLogger } = require('../helpers/logger');
const applicationController = require('../controllers/applicationController');

const logger = childLogger('PatentTokenLaunchWorker');

const GAS_BUFFER_PERCENTAGE = 120;

let IdeaNftContract;
try {
  IdeaNftContract = new ethers.Contract(
    process.env.NFT_CONTRACT_ADDRESS,
    require('../contract/IdeaNft.json'),
    wallet,
  );
  logger.info('IdeaNftContract initialized successfully');
} catch (error) {
  logger.error('Failed to initialize IdeaNftContract:', error);
}

async function validateAdminGasBalance(applicationId, ownerWalletAddress, app) {
  const adminBalance = await provider.getBalance(wallet.address);
  let gasEstimate;
  try {
    const dummyTokenURI = 'ipfs://dummy';
    gasEstimate = await IdeaNftContract.estimateGas.mintNFT(
      ownerWalletAddress,
      dummyTokenURI,
    );
  } catch (error) {
    logger.error('Gas estimation failed in worker', {
      applicationId,
      ownerWalletAddress,
      rawError: error,
    });
    throw new Error(`Gas estimation failed: ${error.message}`);
  }

  const gasPrice = await provider.getGasPrice();
  const requiredGas = gasEstimate.mul(gasPrice);
  const requiredWithBuffer = requiredGas.mul(GAS_BUFFER_PERCENTAGE).div(100);

  if (adminBalance.lt(requiredWithBuffer)) {
    await mongoose.model(MODALS.APPLICATION).findOneAndUpdate(
      { _id: applicationId },
      {
        $set: {
          deployingStatus: 'not_deployed',
        },
      },
    );

    await handleNewNotification(COMMON.CREATE, {
      ownerId: app.owner,
      userId: app.owner,
      itemType: COMMON.APPLICATION,
      itemId: applicationId,
      actions: ['PATENT_TOKEN_LAUNCH_FAILED_INSUFFICIENT_GAS'],
    });

    throw new Error(
      `Insufficient funds in admin wallet. Required: ${ethers.utils.formatEther(requiredWithBuffer)} ETH, Available: ${ethers.utils.formatEther(adminBalance)} ETH`,
    );
  }
}

async function callStartNft(applicationId, owner) {
  let tokenURI;
  let startNftError = null;
  let startNftResponseData = null;
  const mockReqStart = {
    params: { id: applicationId },
    user: owner,
  };
  const mockResStart = {
    json: (data) => {
      startNftResponseData = data;
      tokenURI = data.tokenURI;
      return data;
    },
    status: (statusCode) => {
      logger.info('startNft returned error status:', {
        applicationId,
        statusCode,
      });
      return {
        send: (msg) => {
          startNftError = new Error(`startNft failed: ${msg}`);
          throw startNftError;
        },
        json: (data) => {
          const errorMsg = data.message || data.error || JSON.stringify(data);
          startNftError = new Error(`startNft failed: ${errorMsg}`);
          throw startNftError;
        },
      };
    },
  };

  try {
    logger.info(`Calling startNft for application ${applicationId}`);
    await applicationController.startNft(mockReqStart, mockResStart);
  } catch (error) {
    const errorMessage = startNftError
      ? startNftError.message
      : `startNft threw unexpected error: ${error.message}`;
    logger.error('Error in startNft (catch block):', {
      applicationId,
      error: errorMessage,
      startNftError: startNftError?.message,
      originalError: error.message,
      stack: error.stack,
    });
    if (startNftError) {
      throw startNftError;
    }
    throw new Error(errorMessage);
  }

  if (!tokenURI) {
    const error = new Error(
      `startNft completed but tokenURI is missing for application ${applicationId}`,
    );
    logger.error('TokenURI validation failed:', {
      applicationId,
      error: error.message,
      responseData: startNftResponseData,
    });
    throw error;
  }

  return tokenURI;
}

async function callFinishNft(
  applicationId,
  tokenURI,
  owner,
  ownerWalletAddress,
) {
  let finishNftError = null;
  const adminWalletAddress = wallet.address;

  if (!adminWalletAddress) {
    const error = new Error('Admin wallet address is not configured');
    logger.error('Admin wallet validation failed:', {
      applicationId,
      error: error.message,
    });
    throw error;
  }

  logger.info(
    `Using admin wallet ${adminWalletAddress} to pay for gas, minting NFT to ${ownerWalletAddress}`,
  );

  const mockReqFinish = {
    params: { id: applicationId },
    body: {
      tokenURI,
      walletAddress: adminWalletAddress,
      recipientAddress: ownerWalletAddress,
    },
    user: {
      ...owner,
      walletAddress: adminWalletAddress,
      id: owner.id || owner._id,
      _id: owner._id || owner.id,
    },
  };
  const mockResFinish = {
    json: () => undefined,
    status: () => {
      return {
        send: (msg) => {
          finishNftError = new Error(`finishNft failed: ${msg}`);
          throw finishNftError;
        },
        json: (data) => {
          const errorMsg = data.message || data.error || JSON.stringify(data);
          finishNftError = new Error(`finishNft failed: ${errorMsg}`);
          throw finishNftError;
        },
      };
    },
  };

  try {
    logger.info(
      `Calling finishNft for application ${applicationId} with tokenURI: ${tokenURI}`,
    );
    await applicationController.finishNft(mockReqFinish, mockResFinish);
    logger.info(
      `Successfully minted NFT for application ${applicationId} to ${ownerWalletAddress}`,
    );
  } catch (error) {
    const errorMessage = finishNftError
      ? finishNftError.message
      : `finishNft threw unexpected error: ${error.message}`;
    logger.error('Error in finishNft:', {
      applicationId,
      tokenURI,
      adminWalletAddress,
      ownerWalletAddress,
      error: errorMessage,
      stack: error.stack,
    });
    if (finishNftError) {
      throw finishNftError;
    }
    throw new Error(errorMessage);
  }
}

async function handleFailure(applicationId, error) {
  const errorMessage = error.message || 'Unknown error occurred';

  logger.info('handleFailure called:', {
    applicationId,
    errorMessage,
    errorType: error.constructor.name,
    fullError: error.toString(),
  });

  const isAlreadyInProgress =
    typeof errorMessage === 'string' &&
    (errorMessage.includes('Patent token launch is already in progress') ||
      errorMessage.includes('already_pending') ||
      errorMessage.includes('already_minted'));

  logger.info('Checking if error is "already in progress":', {
    applicationId,
    isAlreadyInProgress,
    errorMessage,
  });

  if (isAlreadyInProgress) {
    logger.warn(
      `Patent token launch already in progress or completed for application ${applicationId}. Skipping failure handling.`,
      {
        applicationId,
        error: errorMessage,
      },
    );
    return;
  }

  logger.error(
    `Failed to process patent token launch for application ${applicationId}: ${errorMessage}`,
    {
      applicationId,
      error: errorMessage,
      stack: error.stack,
      errorType: error.constructor.name,
    },
  );

  try {
    const ObjectId = mongoose.Types.ObjectId;
    const updateResult = await mongoose.model(MODALS.APPLICATION).updateOne(
      { _id: new ObjectId(applicationId) },
      {
        $set: {
          deployingStatus: 'not_deployed',
        },
      },
    );

    if (updateResult.matchedCount === 0) {
      logger.warn(
        `Application ${applicationId} not found when updating status to failed`,
      );
    } else {
      logger.info(
        `Updated application ${applicationId} status to 'not_deployed' after failure`,
      );
    }

    const app = await applicationDal.getOne(applicationId, {
      isSuper: true,
    });
    if (app) {
      await handleNewNotification(COMMON.CREATE, {
        ownerId: app.owner,
        userId: app.owner,
        itemType: COMMON.APPLICATION,
        itemId: applicationId,
        actions: ['PATENT_TOKEN_LAUNCH_FAILED'],
      });
      logger.info(
        `Sent failure notification to owner ${app.owner} for application ${applicationId}`,
      );
    } else {
      logger.warn(
        `Could not send failure notification: Application ${applicationId} not found`,
      );
    }
  } catch (updateError) {
    logger.error(
      `Failed to update application status or send notification for ${applicationId}:`,
      {
        applicationId,
        updateError: updateError.message,
        stack: updateError.stack,
        originalError: errorMessage,
      },
    );
  }
}

async function processPatentTokenLaunch(job) {
  const { applicationId, ownerWalletAddress } = job.data;

  if (!applicationId) {
    const error = new Error('Missing required parameter: applicationId');
    logger.error('Invalid job data:', {
      jobData: job.data,
      error: error.message,
    });
    throw error;
  }

  if (!ownerWalletAddress) {
    const error = new Error('Missing required parameter: ownerWalletAddress');
    logger.error('Invalid job data:', {
      jobData: job.data,
      error: error.message,
    });
    throw error;
  }

  logger.info(
    `Processing patent token launch for application ${applicationId} to wallet ${ownerWalletAddress}`,
    {
      jobId: job.id,
      queueName: job.queueName,
      attempt: job.attemptsMade + 1,
    },
  );

  try {
    const app = await applicationDal.getOne(applicationId, {
      isSuper: true,
    });
    if (!app) {
      const error = new Error(
        `Application ${applicationId} not found in database`,
      );
      logger.error('Application lookup failed:', {
        applicationId,
        error: error.message,
      });
      throw error;
    }

    const owner = await profileDal.getOne(app.owner, { isSuper: true });
    if (!owner) {
      const error = new Error(
        `Owner profile ${app.owner} not found for application ${applicationId}`,
      );
      logger.error('Owner lookup failed:', {
        applicationId,
        ownerId: app.owner,
        error: error.message,
      });
      throw error;
    }

    await validateAdminGasBalance(applicationId, ownerWalletAddress, app);

    const tokenURI = await callStartNft(applicationId, owner);
    if (!tokenURI) {
      const error = new Error(
        `Failed to generate tokenURI for application ${applicationId}`,
      );
      logger.error('Token URI generation failed:', {
        applicationId,
        error: error.message,
      });
      throw error;
    }

    logger.info(
      `Got tokenURI from startNft: ${tokenURI} for application ${applicationId}`,
    );

    await callFinishNft(applicationId, tokenURI, owner, ownerWalletAddress);

    logger.info(
      `Successfully processed patent token launch for application ${applicationId}. NFT minted to ${ownerWalletAddress}`,
    );

    return {
      success: true,
      tokenURI,
      applicationId,
      ownerWalletAddress,
    };
  } catch (error) {
    logger.error(
      `Failed to process patent token launch for application ${applicationId}:`,
      {
        error: error.message,
        stack: error.stack,
        ownerWalletAddress,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      },
    );
    await handleFailure(applicationId, error);
    throw error;
  }
}

module.exports = {
  processPatentTokenLaunch,
};
