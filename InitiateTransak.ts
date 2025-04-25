import { Transak, TransakConfig } from '@transak/transak-sdk';
import { Config } from 'config';
import { CONSTANTS } from 'utilities/constants';
interface InitiateTransakCallbacks {
  onClose?: () => void;
  onOrderCreated?: (orderData: any) => void;
  onOrderSuccessful?: (orderData: any) => void;
}

let isOrderProcessed = false;

export const InitiateTransak = (
  weekly10Percent: number,
  weeklyClaim: number,
  callbacks: InitiateTransakCallbacks = {}
) => {
  const transakConfig: TransakConfig = {
    apiKey: Config.TRANSAC.API_KEY,
    environment: Transak.ENVIRONMENTS.PRODUCTION,
    walletAddress: Config.TRANSAC.MASTER_WALLET,
    cryptoCurrencyList: Config.TRANSAC.POLYGON_SYMBOL,
    defaultFiatCurrency: Config.TRANSAC.USD_SYMBOL
  };

  let amount = weekly10Percent - weeklyClaim;
  transakConfig.fiatAmount = amount >= 3000 ? 3000 : amount;

  const transak = new Transak(transakConfig);
  transak.init();

  Transak.on(Transak.EVENTS.TRANSAK_WIDGET_CLOSE, () => {
    if (callbacks.onClose) callbacks.onClose();
    transak.close();
  });

  Transak.on(Transak.EVENTS.TRANSAK_ORDER_CREATED, (orderData: any) => {
    console.log('Order Created:', orderData);
    if (callbacks.onOrderCreated) {
      callbacks.onOrderCreated(orderData);
    }
  });

  Transak.on(Transak.EVENTS.TRANSAK_ORDER_SUCCESSFUL, (orderData: any) => {
    console.log('Order Success Triggered:', orderData);

    if (
      !isOrderProcessed &&
      orderData.status.status === CONSTANTS.C_COMPLETED_TEXT
    ) {
      isOrderProcessed = true;
      console.log('Order Success Status:', orderData.status);

      if (callbacks.onOrderSuccessful) {
        callbacks.onOrderSuccessful(orderData);
      }
    }
  });

  Transak.on(Transak.EVENTS.TRANSAK_ORDER_FAILED, (orderData: any) => {
    console.error('Order Failed:', orderData);
  });
};
