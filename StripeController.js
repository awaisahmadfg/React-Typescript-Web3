const Stripe = require('stripe');
const { config } = require('dotenv');
const { resolve } = require('path');
const {
  COMMON,
  ERRORS,
  HTTP_STATUS,
  MAGIC_NUMBER,
  STRIPE_TRANSACTIONS,
} = require('../consts/index');
const { RewardPool } = require('../models/RewardPool');
const calculateWeeklyNetAmount = require('../controllers/utils/calculateWeeklyNetAmount');

const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = resolve(__dirname, `../../env/.env.${NODE_ENV}`);
config({ path: envPath });

const { STRIPE_SECRET_KEY } = process.env;
const stripe = Stripe(STRIPE_SECRET_KEY);

const stripeController = {};

const formatAmount = (amount) => amount / MAGIC_NUMBER.HUNDREDEDE;
const formattedDate = (timestamp) => {
  const date = new Date(timestamp * MAGIC_NUMBER.THOUSAND);
  return date
    .toISOString()
    .slice(MAGIC_NUMBER.ZERO, MAGIC_NUMBER.NINETEEN)
    .replace('T', ' ');
};

const fetchPaymentIntents = async (limit, includedStatuses) => {
  const { data } = await stripe.paymentIntents.list({ limit });
  return data
    .filter(({ status }) => includedStatuses.includes(status))
    .map(({ id, amount, status, created }) => ({
      id,
      amount: formatAmount(amount),
      currency: COMMON.C_USD,
      status,
      created: formattedDate(created),
    }));
};

const fetchRefunds = async (limit, includePaymentIntent = false) => {
  const { data } = await stripe.refunds.list({ limit });
  return data.map(({ id, payment_intent, amount, created }) => ({
    id,
    payment_intent: includePaymentIntent ? payment_intent : undefined,
    amount: formatAmount(amount),
    currency: COMMON.C_USD,
    status: STRIPE_TRANSACTIONS.REFUNDED,
    created: formattedDate(created),
  }));
};

const collectRedundantIds = (refundTransactions) => {
  return refundTransactions
    .map((transaction) => transaction.payment_intent)
    .filter((id) => id);
};

const mapTransaction = (tx) => ({
  id: tx.id,
  amount: tx.amount,
  currency: tx.currency,
  status: tx.status,
  created: tx.created,
});

const filterTransactions = (
  status,
  paymentIntents,
  refundTransactions,
  includedStatuses,
  redundantIds,
) => {
  let transactions = [];

  if (status) {
    if (status.toLowerCase() === STRIPE_TRANSACTIONS.REFUNDED) {
      transactions = refundTransactions.map(mapTransaction);
    } else {
      transactions = paymentIntents
        .filter(
          (pi) =>
            !redundantIds.has(pi.id) &&
            includedStatuses.includes(pi.status.toLowerCase()),
        )
        .map(mapTransaction);
    }
  } else {
    transactions = [
      ...paymentIntents
        .filter((pi) => !redundantIds.has(pi.id))
        .map(mapTransaction),
      ...refundTransactions.map(mapTransaction),
    ];
  }

  return transactions.sort((a, b) => new Date(b.created) - new Date(a.created));
};

const paginateData = (transactions, page, perPage) => {
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  return transactions.slice(startIndex, endIndex);
};

stripeController.getTransactionsList = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.perPage, 10) || 10;

    const { limit = MAGIC_NUMBER.DEFAULT_LIMIT, status } = req.query;

    let includedStatuses = [];
    let refundTransactions = [];
    let paymentIntents = [];
    const redundantIds = new Set();

    if (status) {
      const normalizedStatus = status.toLowerCase();
      if (normalizedStatus === STRIPE_TRANSACTIONS.SUCCEEDED) {
        includedStatuses = [STRIPE_TRANSACTIONS.SUCCEEDED];

        paymentIntents = await fetchPaymentIntents(limit, includedStatuses);
        refundTransactions = await fetchRefunds(limit, true);

        const redundantIdsArray = collectRedundantIds(refundTransactions);
        redundantIdsArray.forEach((id) => redundantIds.add(id));
      } else if (normalizedStatus === STRIPE_TRANSACTIONS.REFUNDED) {
        refundTransactions = await fetchRefunds(limit);
      } else {
        includedStatuses = [STRIPE_TRANSACTIONS.CANCELED];
        paymentIntents = await fetchPaymentIntents(limit, includedStatuses);
      }
    } else {
      includedStatuses = [
        STRIPE_TRANSACTIONS.SUCCEEDED,
        STRIPE_TRANSACTIONS.CANCELED,
      ];

      paymentIntents = await fetchPaymentIntents(limit, includedStatuses);

      refundTransactions = await fetchRefunds(limit, true);
      const redundantIdsArray = collectRedundantIds(refundTransactions);
      redundantIdsArray.forEach((id) => redundantIds.add(id));
    }

    const filteredTransactions = filterTransactions(
      status,
      paymentIntents,
      refundTransactions,
      includedStatuses,
      redundantIds,
    );

    const slicedData = paginateData(filteredTransactions, page, perPage);

    res.json({
      data: slicedData,
      total: filteredTransactions.length,
    });
  } catch (error) {
    console.error(ERRORS.STRIPE_TRANSACTION_ERROR, error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .send({ error: error.message });
  }
};

stripeController.getWeeklyNetAmount = async (req, res) => {
  const weeklyNetAmount = await calculateWeeklyNetAmount();
  res.json({ weeklyNetAmount });
};

stripeController.getOverallNetAmount = async (req, res) => {
  try {
    const paymentIntents = await stripe.paymentIntents.list({
      limit: MAGIC_NUMBER.HUNDREDEDE,
    });

    const includedStatuses = [STRIPE_TRANSACTIONS.SUCCEEDED];
    const filteredPaymentIntents = paymentIntents.data.filter((pi) =>
      includedStatuses.includes(pi.status),
    );

    let overallNetAmount = filteredPaymentIntents.reduce(
      (sum, pi) => sum + pi.amount / MAGIC_NUMBER.HUNDREDEDE,
      0,
    );

    const refundsResponse = await stripe.refunds.list({
      limit: MAGIC_NUMBER.HUNDREDEDE,
    });

    const totalRefundsAmount = refundsResponse.data.reduce(
      (sum, refund) => sum + refund.amount / MAGIC_NUMBER.HUNDREDEDE,
      0,
    );

    overallNetAmount = overallNetAmount - totalRefundsAmount;
    res.json({ overallNetAmount });
  } catch (error) {
    console.error(ERRORS.STRIPE_TRANSACTION_ERROR, error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .send({ error: error.message });
  }
};

stripeController.getRewardPoolData = async (req, res) => {
  try {
    let skip = MAGIC_NUMBER.ZERO;
    let limit = MAGIC_NUMBER.TEN;

    const range = req?.query?.range ? JSON.parse(req?.query?.range) : null;

    if (range) {
      skip = range[0];
      limit = range[1] - range[0] + 1;
    }

    const [rewardPools, total] = await Promise.all([
      RewardPool.find().skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      RewardPool.countDocuments(),
    ]);

    const data = rewardPools.map((pool) => ({
      ...pool,
      id: pool._id.toString(),
    }));

    res.json({ data, total });
  } catch (error) {
    console.error(ERRORS.ERROR_FETCHING_REWARD_POOL, error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: error.message });
  }
};

stripeController.updateRewardPoolData = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderIdFromTransak } = req.body;

    if (orderIdFromTransak) {
      const updatedRewardPool = await RewardPool.findByIdAndUpdate(
        id,
        {
          $set: { orderId: orderIdFromTransak },
        },
        { new: true },
      );

      if (!updatedRewardPool) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json({ error: ERRORS.REWARD_POOL_UPDATE });
      }

      return res.status(HTTP_STATUS.OK).json({
        message: COMMON.REWARD_POOL_UPDATED,
        rewardPool: updatedRewardPool,
      });
    }

    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json({ error: ERRORS.INVALID_PAYLOAD });
  } catch (error) {
    console.error(ERRORS.REWARD_POOL_ERROR, error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERRORS.INTERNAL_SERVER_ERROR });
  }
};

module.exports = stripeController;
