/* eslint-disable */
const { config } = require('dotenv');
const { resolve } = require('path');
const { HTTP_STATUS, ERRORS } = require('../consts/index');
const { buildTransakWidgetParams } = require('../helpers/transakWidgetParams');

const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = resolve(__dirname, `../../env/.env.${NODE_ENV}`);
config({ path: envPath });

const {
  TRANSAK_API_KEY,
  TRANSAK_SECRET_KEY,
  // Staging: https://api-stg.transak.com
  // Production: https://api.transak.com
  TRANSAK_API_BASE_URL = 'https://api-stg.transak.com',
  TRANSAK_WIDGET_BASE_URL = 'https://api-gateway-stg.transak.com',
  TRANSAK_SANDBOX_TESTNET,
  TRANSAK_SANDBOX_CHAIN_ID,
} = process.env;

const SANDBOX_TESTNET = TRANSAK_SANDBOX_TESTNET === 'true';
const PRODUCTION_ENDPOINTS =
  TRANSAK_API_BASE_URL === 'https://api.transak.com' &&
  TRANSAK_WIDGET_BASE_URL === 'https://api-gateway.transak.com';
const STAGING_ENDPOINTS =
  TRANSAK_API_BASE_URL === 'https://api-stg.transak.com' &&
  TRANSAK_WIDGET_BASE_URL === 'https://api-gateway-stg.transak.com';

const transakController = {};

const TRANSAK_CRYPTO_NETWORK = { USDT: 'polygon', ETH: 'ethereum' };

function getEndUserIp(req) {
  let ip = String(req.ip || '127.0.0.1');
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip === '::1' ? '127.0.0.1' : ip;
}

function buildWidgetParams(query) {
  const {
    walletAddress,
    fiatAmount,
    cryptoCurrency,
    fiatCurrency,
    redirectURL,
  } = query;
  const widgetParams = { apiKey: TRANSAK_API_KEY, referrerDomain: 'localhost' };

  if (redirectURL && URL.canParse(String(redirectURL))) {
    widgetParams.redirectURL = redirectURL;
    widgetParams.referrerDomain = new URL(redirectURL).hostname;
  }
  if (walletAddress) widgetParams.walletAddress = walletAddress;
  if (fiatCurrency) widgetParams.fiatCurrency = fiatCurrency;
  if (fiatAmount) widgetParams.fiatAmount = Number(fiatAmount);
  if (cryptoCurrency) {
    const code = String(cryptoCurrency).toUpperCase();
    widgetParams.cryptoCurrencyCode = code;
    if (TRANSAK_CRYPTO_NETWORK[code]) {
      widgetParams.network = TRANSAK_CRYPTO_NETWORK[code];
    }
  }
  return widgetParams;
}

/**
 * GET /api/transactions/transak-widget-url
 *
 * Secure Transak session flow per official docs:
 * https://docs.transak.com/integration/web/website-redirection
 *
 * Step 1: POST /partners/api/v2/refresh-token
 *         Headers: { 'api-secret': TRANSAK_SECRET_KEY }
 *         Body:    { apiKey: TRANSAK_API_KEY }
 *         → returns accessToken
 *
 * Step 2: POST /api/v2/auth/session
 *         Headers: { 'access-token', 'x-api-key', 'x-user-ip' }
 *         Body:    { widgetParams: { apiKey, walletAddress, ... } }
 *         → returns widgetUrl (contains sessionId, valid 5 min, one-time use)
 *
 * Step 3: Return widgetUrl to frontend — opened in new tab (no iframe)
 */
transakController.getTransakWidgetUrl = async (req, res) => {
  try {
    if (!TRANSAK_API_KEY || !TRANSAK_SECRET_KEY) {
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: 'Transak API key or secret key is not configured' });
    }

    const transakHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': TRANSAK_API_KEY,
      'x-user-ip': getEndUserIp(req),
    };

    // Wallet funding requests carry a chainId and use the strict, validated
    // flow. Requests without one (admin reward-pool top-up) keep the pool buy
    // flow unchanged.
    let widgetParams;
    if (req.query.chainId === undefined) {
      widgetParams = buildWidgetParams(req.query);
    } else {
      if (SANDBOX_TESTNET && !/^\d+$/u.test(TRANSAK_SANDBOX_CHAIN_ID || '')) {
        return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
          error:
            'TRANSAK_SANDBOX_TESTNET requires TRANSAK_SANDBOX_CHAIN_ID (e.g. 11155111 for Sepolia).',
        });
      }

      try {
        widgetParams = buildTransakWidgetParams(
          req.query,
          TRANSAK_API_KEY,
          req.headers?.origin,
          {
            sandboxChainId: SANDBOX_TESTNET
              ? TRANSAK_SANDBOX_CHAIN_ID
              : undefined,
          },
        );
      } catch (error) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ error: error.message });
      }

      // Opt-in sandbox mode only runs against Transak staging; the default
      // (flag unset) is mainnet-only and requires production endpoints.
      if (SANDBOX_TESTNET && !STAGING_ENDPOINTS) {
        return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
          error:
            'TRANSAK_SANDBOX_TESTNET requires the Transak staging endpoints (api-stg / api-gateway-stg).',
        });
      }
      if (!SANDBOX_TESTNET && !PRODUCTION_ENDPOINTS) {
        return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
          error:
            'Live Ethereum funding requires production Transak credentials and endpoints. Sandbox orders do not deliver spendable ETH.',
        });
      }
    }

    // ── Step 1: Get Access Token (refresh-token endpoint per Transak docs) ────
    const tokenResponse = await fetch(
      `${TRANSAK_API_BASE_URL}/partners/api/v2/refresh-token`,
      {
        method: 'POST',
        headers: {
          ...transakHeaders,
          'api-secret': TRANSAK_SECRET_KEY,
        },
        body: JSON.stringify({
          apiKey: TRANSAK_API_KEY,
        }),
      },
    );

    const tokenText = await tokenResponse.text();

    if (!tokenResponse.ok) {
      console.error('[Transak] Failed to get access token:', tokenText);
      return res.status(HTTP_STATUS.BAD_GATEWAY).json({
        error: 'Failed to authenticate with Transak',
        details: tokenText,
      });
    }

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      return res.status(HTTP_STATUS.BAD_GATEWAY).json({
        error: 'Transak returned invalid JSON for access token',
        details: tokenText,
      });
    }

    const accessToken = tokenData?.data?.accessToken;
    if (!accessToken) {
      console.error('[Transak] No accessToken in response:', tokenData);
      return res.status(HTTP_STATUS.BAD_GATEWAY).json({
        error: 'Transak did not return an access token',
        details: tokenData,
      });
    }

    // ── Step 2: Create Widget Session → get widgetUrl (with sessionId) ────────

    const sessionResponse = await fetch(
      `${TRANSAK_WIDGET_BASE_URL}/api/v2/auth/session`,
      {
        method: 'POST',
        headers: {
          ...transakHeaders,
          'access-token': accessToken,
        },
        body: JSON.stringify({ widgetParams }),
      },
    );

    const sessionText = await sessionResponse.text();

    if (!sessionResponse.ok) {
      console.error('[Transak] Session creation failed:', sessionText);
      return res.status(HTTP_STATUS.BAD_GATEWAY).json({
        error: 'Failed to create Transak session',
        details: sessionText,
      });
    }

    let sessionData;
    try {
      sessionData = JSON.parse(sessionText);
    } catch {
      return res.status(HTTP_STATUS.BAD_GATEWAY).json({
        error: 'Transak returned invalid JSON for session',
        details: sessionText,
      });
    }

    const widgetUrl = sessionData?.data?.widgetUrl;
    if (!widgetUrl) {
      console.error('[Transak] No widgetUrl in session response:', sessionData);
      return res.status(HTTP_STATUS.BAD_GATEWAY).json({
        error: 'Transak did not return a widget URL',
        details: sessionData,
      });
    }

    return res.status(HTTP_STATUS.OK).json({ widgetUrl });
  } catch (error) {
    console.error('[Transak] getTransakWidgetUrl unexpected error:', error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERRORS.INTERNAL_SERVER_ERROR });
  }
};

module.exports = transakController;
