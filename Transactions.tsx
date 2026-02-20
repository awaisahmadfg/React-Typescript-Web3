import React, { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import CommunityIcon from 'assets/icons/communities.svg';
import {
  TransactionContainer,
  WalletContainer
} from 'components/MyWallet/styledComponents';
import {
  Transaction,
  TransactionsView
} from 'components/MyWallet/tabs/TransactionsView';
import { WalletTabsView } from 'components/MyWallet/WalletTabsView';
import { openTransakBuyModalFunc } from 'helpers';
import { fetchIdeaCoinPriceUsd, getTransactions } from 'helpers/blockchain';
import { TransferModal } from 'modals/TransferModal';
import { useDispatch } from 'react-redux';
import { GetOpenTransakBuyModalObj, GetUser } from 'redux-state/selectors';
import { ASSET_TYPES, Constants } from 'utilities/constants';
import { Tag } from 'components/CardTag';
import { WalletBalanceAndButtons } from './WalletUtils';
import { WalletAddressView } from './WalletAddressView';

export const MyNewWallet = ({
  closeButton,
  community,
  onViewMarketplaceClick
}: {
  closeButton?: any;
  community?: Tag;
  onViewMarketplaceClick?: () => void;
}) => {
  const user = GetUser();
  const dispatch = useDispatch();
  const openTransakBuyModal = GetOpenTransakBuyModalObj();
  const [tooltipText, setTooltipText] = useState<string>('Copy to clipboard');
  const [walletType, setWalletType] = useState<string>(ASSET_TYPES.ETHEREUM);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [triggerRefresh, setTriggerRefresh] = useState(0);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [preloadedIdeaCoinPriceUsd, setPreloadedIdeaCoinPriceUsd] = useState<
    number | null
  >(null);
  const activeProfile = community ? community : user;

  useEffect(() => {
    fetchIdeaCoinPriceUsd()
      .then(setPreloadedIdeaCoinPriceUsd)
      .catch(() => setPreloadedIdeaCoinPriceUsd(0));
  }, []);

  const fetchTransactions = useCallback(() => {
    setLoading(true);
    getTransactions(activeProfile?.walletAddress, walletType)
      // eslint-disable-next-line promise/prefer-await-to-then
      .then((response) => {
        // eslint-disable-next-line no-shadow
        const transactions =
          walletType === ASSET_TYPES.ETHEREUM
            ? response.result.filter(
                (t) => !ethers.utils.parseEther(t.value.toString()).isZero()
              )
            : response.result;
        setTransactions(transactions);
      })
      // eslint-disable-next-line promise/prefer-await-to-then
      .catch((error) => {
        console.error({ error });
      })
      // eslint-disable-next-line promise/prefer-await-to-then
      .finally(() => {
        setLoading(false);
      });
  }, [activeProfile?.walletAddress, walletType]);

  const handleCopyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(activeProfile?.walletAddress);
    setTooltipText(Constants.ADDRESS_COPIED);
  }, [activeProfile?.walletAddress]);

  useEffect(() => {
    if (openTransakBuyModal?.open) {
      openTransakBuyModalFunc(activeProfile?.walletAddress, dispatch);
    }
  }, [openTransakBuyModal?.open, activeProfile?.walletAddress, dispatch]);

  return (
    <TransactionContainer>
      <WalletContainer>
        <WalletAddressView
          activeProfile={activeProfile}
          tooltipText={tooltipText}
          handleCopyToClipboard={handleCopyToClipboard}
          walletType={walletType}
          setWalletType={setWalletType}
        />
        <WalletBalanceAndButtons
          walletType={walletType}
          address={activeProfile?.walletAddress}
          user={user}
          triggerRefresh={triggerRefresh}
          setBalance={setBalance}
          closeButton={closeButton}
          dispatch={dispatch}
          handleSendClick={() => setShowTransferModal(true)}
          onViewMarketplaceClick={onViewMarketplaceClick}
          preloadedIdeaCoinPriceUsd={preloadedIdeaCoinPriceUsd}
        />
      </WalletContainer>

      <WalletTabsView
        tabs={[
          {
            title: Constants.TRANSACTIONS,
            iconUrl: CommunityIcon,
            content: (
              <TransactionsView
                refresh={triggerRefresh}
                walletType={walletType}
                fetchTransactions={fetchTransactions}
                transactions={transactions}
                loading={loading}
              />
            )
          }
        ]}
        initialTab={Constants.TRANSACTIONS}
        fetchTransactions={fetchTransactions}
      />
      {showTransferModal && (
        <TransferModal
          balance={balance}
          setOpen={setShowTransferModal}
          triggerRefresh={setTriggerRefresh}
          type={walletType}
          walletAddress={activeProfile?.walletAddress}
        />
      )}
    </TransactionContainer>
  );
};
