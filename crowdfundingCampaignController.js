/* eslint-disable */
const { default: mongoose } = require('mongoose');
const nodeCron = require('node-cron');
const {
  queueDb,
  QUEUE_REWARD_DISTRIBUTE,
  QUEUE_MANUFACTURER_EMAIL,
} = require('../helpers/queueDb.js');
const {
  ERRORS,
  MODALS,
  HTTP_STATUS,
  COMMON,
  STAKED_APPLICATION_STATUS,
  PAYMENT_STATUS,
  SUCCESS_MESSAGES,
  MAGIC_NUMBER,
  TYPES,
  RESOURCES,
  QUOTATION_STATUS,
} = require('../consts/index.js');
const { crowdfundingCampaignDal, applicationDal } = require('../dal/index.js');
const emailService = require('../helpers/email.js');
const { errors } = require('../helpers/errors.js');
const { handleNewNotification } = require('../helpers/notification.js');
const { childLogger } = require('../helpers/logger.js');
const stripe = require('../helpers/stripe.js');
const { goHighLevelService } = require('../services/goHighLevelService.js');
const { updateQuotationStatuses } = require('../helpers/crowdfunding.js');
const { NFT } = require('../models/NFT');

const crowdfundingCampaignController = {};
const logger = childLogger(COMMON.PROBLEM_CONTROLLER);

crowdfundingCampaignController.create = async (req, res) => {
  try {
    const acceptedQuotationId = req.body.quotationId;
    const inventionId = req.body.campaign.applicationId;

    // Check if any NFT associated with this invention is listed
    const listedNft = await NFT.findOne({
      invention: inventionId,
      isListed: true,
    });

    if (listedNft) {
      return res.status(400).json({
        success: false,
        error:
          'Cannot start crowdfunding campaign. This Patent Token is currently listed on the marketplace. Please cancel the listing first.',
      });
    }

    const data = await crowdfundingCampaignDal.create(
      req.body.campaign,
      req.user,
    );

    const updatedQuotation = await updateQuotationStatuses({
      acceptedQuotationId,
      inventionId,
    });

    const updatedApplication = await applicationDal.update(
      inventionId,
      {
        stakingInProgress: COMMON.STARTED,
        crowdfundingCampaign: data?._id ?? data?.id,
        acceptedQuotation: acceptedQuotationId,
      },
      req.user,
    );

    await Promise.all([
      handleNewNotification(COMMON.CREATE, {
        ownerId: req.user.id,
        userId: updatedQuotation.manufacturer,
        itemType: TYPES.APPLICATION,
        itemId: updatedApplication.id,
        actions: COMMON.START_CROWDFUNDING,
      }),
      handleNewNotification(COMMON.CREATE, {
        ownerId: req.user.id,
        userId: req.user.id,
        itemType: TYPES.APPLICATION,
        itemId: updatedApplication.id,
        actions: COMMON.ACCEPT_QUOTATION,
      }),
    ]);

    const manufacturer = await mongoose
      .model(MODALS.PROFILE)
      .findOne({ _id: updatedQuotation.manufacturer });

    queueDb.addToQueue(QUEUE_MANUFACTURER_EMAIL, {
      type: 'acceptQuotation',
      user: manufacturer,
      application: updatedApplication,
    });

    // queueDb.createWorker(QUEUE_MANUFACTURER_EMAIL, async (item) => {
    //   const { user, application } = item.data;
    //   await emailService.sendAcceptQuotationEmail({
    //     email: user.email,
    //     recipientFirstName: user.username,
    //     username: user.firstName || user.username || user.email,
    //     user,
    //     application,
    //   });
    // });

    res.json({
      campaign: data,
      updatedQuotation,
      updatedApplication,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send(error.message);
  }
};

crowdfundingCampaignController.getOneByApplicationId = async (req, res) => {
  try {
    const data = await crowdfundingCampaignDal.getOneByApplicationId(
      req.params.id,
    );
    res.json(data);
  } catch (error) {
    const message = ERRORS.ERROR_IN_GETTING_INVENTION_STAKER;
    errors.handleError(res, error, message, logger);
  }
};

const fetchInventionStaker = async (applicationId) => {
  const inventionStaker =
    await crowdfundingCampaignDal.getOneByApplicationId(applicationId);
  if (!inventionStaker) {
    throw new Error(ERRORS.INVENTION_STAKER_NOT_FOUND);
  }
  return inventionStaker;
};

const updateStakersList = (
  inventionStaker,
  stakerId,
  numberOfStake,
  paymentIntent,
) => {
  const stakerIndex = inventionStaker.stakers.findIndex(
    (staker) => staker.id.toString() === stakerId.toString(),
  );

  const updatedStakers = inventionStaker.stakers.map((staker, index) =>
    index === stakerIndex
      ? {
          ...staker,
          numberOfStake:
            parseFloat(staker.numberOfStake || 0) +
            parseFloat(numberOfStake || 0),
          paymentIntent: String(paymentIntent),
        }
      : staker,
  );

  if (stakerIndex === -1) {
    updatedStakers.push({
      id: stakerId,
      numberOfStake: numberOfStake,
    });
  }

  return updatedStakers;
};

const updateInventionStaker = async (
  applicationId,
  updatedStakers,
  additionalStake,
) => {
  return await mongoose.model(MODALS.CROWDFUNDING_CAMPAIGN).findOneAndUpdate(
    { applicationId },
    {
      stakers: updatedStakers,
      amountStaked: additionalStake.toString(),
    },
    { new: true },
  );
};

const handleThresholdFulfillment = async (
  applicationId,
  updatedInventionStaker,
) => {
  try {
    const updatedApplication = await mongoose
      .model(MODALS.APPLICATION)
      .findOneAndUpdate(
        { _id: applicationId },
        { stakingInProgress: COMMON.COMPLETED },
        { new: true },
      );

    const quotation = await mongoose.model(MODALS.QUOTATION).findOne({
      invention: updatedApplication?._id ?? updatedApplication?.id,
      status: QUOTATION_STATUS.ACCEPTED,
    });

    const manufacturer = await mongoose
      .model(MODALS.PROFILE)
      .findOne({ _id: quotation.manufacturer });

    const inventor = await mongoose
      .model(MODALS.PROFILE)
      .findOne({ _id: updatedApplication?.owner });

    handleNewNotification(COMMON.CREATE, {
      ownerId: updatedApplication.owner,
      userId: [manufacturer?._id],
      itemType: TYPES.APPLICATION,
      itemId: updatedApplication._id,
      actions: [COMMON.PRODUCTION],
    });

    // const inventorHighleveleData = {
    //   email: inventor?.email,
    //   firstName: inventor?.username,
    //   customFields: [
    //     {
    //       id: `${process.env.CROWDFUNDING_INVENTOR}`, //crowdfunding inventor
    //       field_value: inventor?.username || '',
    //     },
    //     {
    //       id: `${process.env.INVENTION_NAME}`, //invention name
    //       field_value: `${updatedApplication?.title}` || '',
    //     },
    //   ],
    // };
    // try {
    //   const apiCall = await goHighLevelService.updateContact(
    //     inventor?.contactId,
    //     inventorHighleveleData,
    //   );
    // } catch (apiError) {
    //   console.error(
    //     ERRORS.CROWDFUNDING_INVENTOR_ERROR,
    //     inventor.username,
    //     apiError,
    //   );
    // }

    // MOVE TO SEND GRID
    // queueDb.addToQueue(QUEUE_MANUFACTURER_EMAIL, {
    //   type: 'updateContact',
    //   email: manufacturer.email,
    //   recipientFirstName: manufacturer.username,
    //   user:
    //     manufacturer.firstName || manufacturer.username || manufacturer.email,
    //   communityPicture: 'MindMiner Owner',
    //   password: process.env.DEFAULT_PASSWORD,
    //   websiteUrl: `${process.env.CLIENT_HOST}/manufacturer-dashboard/${manufacturer.key}`,
    //   supportEmail: '',
    //   tag: 'tag',
    //   communityManager: 'MindMiner Owner',
    //   userKey: manufacturer.key,
    // });

    // queueDb.createWorker(QUEUE_MANUFACTURER_EMAIL, async (item) => {
    //   try {
    //     const { email, firstName, lastName } = item.data;
    //     const manufacturerHighleveleData = {
    //       email: email,
    //       firstName: firstName,
    //       lastName: lastName,
    //       customFields: [
    //         {
    //           id: `${process.env.CROWDFUNDING_MANUFACTURER}`, //crowdfunding manufacturer
    //           field_value: manufacturer.username || '',
    //         },
    //         {
    //           id: `${process.env.MANUFACTURER_NAME}`, //manufacturer name
    //           field_value: manufacturer.username || '',
    //         },
    //         {
    //           id: `${process.env.INVENTION_NAME}`, //invention name
    //           field_value: `${updatedApplication?.title}` || '',
    //         },
    //       ],
    //     };
    //     await goHighLevelService.updateContact(
    //       manufacturer.contactId,
    //       manufacturerHighleveleData,
    //     );
    //   } catch (error) {
    //     console.error(error);
    //   }
    // });

    queueDb.addToQueue(QUEUE_REWARD_DISTRIBUTE, {
      ...updatedInventionStaker,
      type: 'distribute',
    });
  } catch (err) {
    console.error(err);
  }
};

crowdfundingCampaignController.addStaker = async (
  applicationId,
  numberOfStake,
  userId,
  paymentIntent,
) => {
  try {
    const stakerId = JSON.parse(userId);

    const inventionStaker = await fetchInventionStaker(applicationId);

    const additionalStake =
      parseFloat(inventionStaker.minimumStakeAmount) * numberOfStake;

    const updatedStakers = updateStakersList(
      inventionStaker,
      stakerId,
      numberOfStake,
      paymentIntent,
    );

    let updatedInventionStaker = await updateInventionStaker(
      applicationId,
      updatedStakers,
      parseFloat(inventionStaker.amountStaked || '0') + additionalStake,
    );

    if (!updatedInventionStaker) {
      return { success: false, message: ERRORS.INVENTION_STAKER_UPDATE_FAILED };
    }

    if (
      updatedInventionStaker.amountStaked >=
      updatedInventionStaker.stakingThreshold
    ) {
      updatedInventionStaker = await mongoose
        .model(MODALS.CROWDFUNDING_CAMPAIGN)
        .findOneAndUpdate(
          { applicationId },
          { status: STAKED_APPLICATION_STATUS.FULFILLED },
          { new: true },
        );
      await handleThresholdFulfillment(applicationId, updatedInventionStaker);
    }
    await crowdfundingCampaignDal.distributeRewardsToInfluencer(
      userId,
      applicationId,
      updatedInventionStaker,
    );
    return { success: true };
  } catch (error) {
    return { success: false, message: ERRORS.ERROR_IN_ADDING_STAKER };
  }
};

crowdfundingCampaignController.createCheckoutSession = async (req, res) => {
  try {
    const { amount, applicationId, numberOfStake, redirectURL, items } =
      req.body;

    const baseUrl = `${process.env.HOST}/${COMMON.API}/${RESOURCES.CROWDFUNDING}/${COMMON.PAYMENT_SUCCES}`;

    const metadata = {
      applicationId,
      numberOfStake,
      redirectURL,
      userId: JSON.stringify(req?.user?.id),
    };

    const session = await stripe.create(
      items,
      {
        success_url: `${baseUrl}?${COMMON.STATUS}=${PAYMENT_STATUS.APPROVED}&${COMMON.SESSION_ID}={${COMMON.CHECKOUT_SESSION_ID}}`,
        cancel_url: `${baseUrl}?${COMMON.STATUS}=${PAYMENT_STATUS.CANCELLED}`,
        mode: 'payment',
        metadata,
      },
      amount,
    );

    if (session.error) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(session);
    }

    res.json({
      sessionId: session.stripeSessionId,
      pubKey: session.pubKey,
    });
  } catch (error) {
    console.error(ERRORS.ERROR_CREATING_CHECKOUT_SESSION, error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERRORS.ERROR_CREATING_CHECKOUT_SESSION });
  }
};

crowdfundingCampaignController.paymentSuccess = async (req, res) => {
  const sessionId = req.query.session_id;
  try {
    const session = await stripe.retrieve(sessionId);
    const { metadata, payment_status, payment_intent } = session;

    if (payment_status === COMMON.PAID) {
      const { applicationId, numberOfStake, redirectURL, userId } = metadata;

      const response = await crowdfundingCampaignController.addStaker(
        applicationId,
        numberOfStake,
        userId,
        payment_intent,
      );

      if (!response.success) {
        res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ message: ERRORS.ERROR_ADDING_STAKER_PAYMENT_IS_CONFIRMED });
      }

      res.redirect(redirectURL);
    } else {
      res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ message: ERRORS.PAYMANET_FAILED });
    }
  } catch (error) {
    console.error(ERRORS.ERROR_HANDLING_PAYMENT_SUCCESS, error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERRORS.ERROR_HANDLING_PAYMENT_SUCCESS });
  }
};

const processRefund = async (staker, document, deductionFactor) => {
  try {
    if (staker.paymentStatus !== COMMON.REFUNDED) {
      const totalAmount = parseInt(
        staker.numberOfStake * document.minimumStakeAmount,
        10,
      );
      const deduction = 2 * deductionFactor(totalAmount);
      const refundAmount = totalAmount - deduction;

      const refundResponse = await stripe.refunds(
        staker.paymentIntent,
        Math.max(refundAmount, 0),
      );

      if (refundResponse.success === true) {
        await mongoose
          .model(MODALS.CROWDFUNDING_CAMPAIGN)
          .updateOne(
            { _id: document._id, 'stakers.id': staker.id },
            { $set: { 'stakers.$.paymentStatus': COMMON.REFUNDED } },
          );
        console.error(
          `${SUCCESS_MESSAGES.REFUND_SUCCESSFUL_FOR_STAKER_ID} ${staker.id}`,
        );
      } else {
        console.error(
          `${SUCCESS_MESSAGES.REFUND_FAILED_FOR_STAKER_ID} ${staker.id}`,
        );
      }
    } else {
      console.error(
        `${SUCCESS_MESSAGES.NO_REFUND_REQUIRED_FOR_STAKER_ID} ${staker.id}`,
      );
    }
  } catch (error) {
    console.error(
      `${ERRORS.ERROR_WHILE_PROCESSING_REFUND} ${staker.id}`,
      error,
    );
  }
};

const calculateDeductionFactor = (amount) =>
  MAGIC_NUMBER.ZERO_POINT_ZERO_TWO_FIVE * amount +
  MAGIC_NUMBER.ZERO_POINT_THREE;

nodeCron.schedule('0 * * * *', async () => {
  try {
    const currentDate = new Date();
    const inProgressDocuments = await mongoose
      .model(MODALS.CROWDFUNDING_CAMPAIGN)
      .find({
        status: STAKED_APPLICATION_STATUS.IN_PROGRESS,
        timePeriod: { $gte: currentDate },
      });

    for (const document of inProgressDocuments) {
      const application = await mongoose
        .model(MODALS.APPLICATION)
        .findById(document.applicationId)
        .populate('owner');

      const quotation = await mongoose
        .model(MODALS.QUOTATION)
        .findOne({ invention: document.applicationId })
        .populate({ path: 'manufacturer', model: MODALS.PROFILE });

      const itemId = application._id;
      const ownerId = application.owner._id;
      const manufacturerId = quotation.manufacturer._id;
      const stakerIds = document.stakers.map((s) => s.id);

      Promise.all([
        handleNewNotification(COMMON.CREATE, {
          ownerId: ownerId,
          userId: ownerId,
          itemType: COMMON.APPLICATION,
          ideaPoints: null,
          itemId: itemId,
          actions: [COMMON.OWNER_CROWDFUNDING_EXPIRED],
        }),
        handleNewNotification(COMMON.CREATE, {
          ownerId: manufacturerId,
          userId: manufacturerId,
          itemType: COMMON.APPLICATION,
          ideaPoints: null,
          itemId: itemId,
          actions: [COMMON.MANUFACTURER_CROWDFUNDING_EXPIRED],
        }),
      ]);

      queueDb.addToQueue(QUEUE_MANUFACTURER_EMAIL, {
        type: 'campaignExpire',
        user: application.owner,
        application,
      });

      // queueDb.createWorker(QUEUE_MANUFACTURER_EMAIL, async (item) => {
      //   const { user, application } = item.data;
      //   await emailService.sendCampaignExpireEmail({
      //     email: user.email,
      //     recipientFirstName: user.username,
      //     username: user.firstName || user.username || user.email,
      //     websiteUrl: `${process.env.CLIENT_HOST}/profiles/${user.key}?currentTab=Inventions&inventionId=${application.id}`,
      //     user,
      //     application,
      //   });
      // });

      queueDb.addToQueue(QUEUE_MANUFACTURER_EMAIL, {
        type: 'manufacturerCampaignExpire',
        user: quotation.manufacturer,
        application,
      });

      // queueDb.createWorker(QUEUE_MANUFACTURER_EMAIL, async (item) => {
      //   const { user, application } = item.data;
      //   await emailService.sendManufacturerCampaignExpireEmail({
      //     email: user.email,
      //     recipientFirstName: user.username,
      //     username: user.firstName || user.username || user.email,
      //     websiteUrl: `${process.env.CLIENT_HOST}/profiles/${user.key}?currentTab=Inventions&inventionId=${application.id}`,
      //     user,
      //     application,
      //   });
      // });

      if (stakerIds?.length > 0) {
        for (const stakerId of stakerIds) {
          handleNewNotification(COMMON.CREATE, {
            ownerId: stakerId,
            userId: stakerId,
            itemType: COMMON.APPLICATION,
            ideaPoints: null,
            itemId: itemId,
            actions: [COMMON.STAKERS_CROWDFUNDING_EXPIRED],
          });
        }
      }
    }

    const documentIds = inProgressDocuments.map((doc) => doc._id);
    if (documentIds.length > 0) {
      await mongoose
        .model(MODALS.CROWDFUNDING_CAMPAIGN)
        .updateMany(
          { _id: { $in: documentIds } },
          { $set: { status: STAKED_APPLICATION_STATUS.TIME_PERIOD_OVER } },
        );
    }

    const applicationIds = inProgressDocuments.map((doc) => doc.applicationId);

    if (applicationIds.length > 0) {
      await mongoose
        .model(MODALS.APPLICATION)
        .updateMany(
          { _id: { $in: applicationIds } },
          { $set: { stakingInProgress: COMMON.EXPIRED } },
        );
    }

    const refundPromises = inProgressDocuments.flatMap((document) =>
      document.stakers.map((staker) =>
        processRefund(staker, document, calculateDeductionFactor),
      ),
    );
    await Promise.all(refundPromises);
  } catch (error) {
    console.error(ERRORS.ERROR_DURING_SCHEDULE_TASK, error);
  }
});

module.exports = crowdfundingCampaignController;
