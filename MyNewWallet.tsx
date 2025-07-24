import React, { useCallback, useEffect, useState } from 'react';
import { Box, Tooltip } from '@mui/material';
import card from 'assets/icons/card.png';
import cart from 'assets/icons/cart.png';
import clipboard from 'assets/icons/clipboard.png';
import CommunityIcon from 'assets/icons/communities.svg';
import send from 'assets/icons/send.png';
import swap from 'assets/icons/swap.png';
import {
  BuyButton,
  ConnectButton,
  CopyButton,
  SendButton,
  SwapButton,
  TransactionContainer,
  WalletAddressBox,
  WalletContainer
} from 'components/MyWallet/styledComponents';
import {
  Transaction,
  TransactionsView
} from 'components/MyWallet/tabs/TransactionsView';
import { WalletSelect } from 'components/MyWallet/WalletSelect';
import { WalletTabsView } from 'components/MyWallet/WalletTabsView';
import { ethers } from 'ethers';
import { openTransakBuyModalFunc } from 'helpers';
import { getTransactions } from 'helpers/blockchain';
import { TransferModal } from 'modals/TransferModal';
import { useDispatch } from 'react-redux';
import Actions from 'redux-state/actions';
import { GetOpenTransakBuyModalObj, GetUser } from 'redux-state/selectors';
import {
  ASSET_TYPES,
  Constants,
  USER_ROLES,
  VARIANT
} from 'utilities/constants';
import { Body } from '../common/StyledComponents';
import { WalletBalanceAndButtons } from './WalletUtils';

export const MyNewWallet = ({ closeButton }: { closeButton?: any }) => {
  const user = GetUser();
  const dispatch = useDispatch();
  const openTransakBuyModal = GetOpenTransakBuyModalObj();
  const [tooltipText, setTooltipText] = useState<string>('Copy to clipboard');
  const [walletType, setWalletType] = useState<string>(ASSET_TYPES.MATIC);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [triggerRefresh, setTriggerRefresh] = useState(0);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTransactions = useCallback(() => {
    setLoading(true);
    getTransactions(user?.walletAddress, walletType)
      // eslint-disable-next-line promise/prefer-await-to-then
      .then((response) => {
        // eslint-disable-next-line no-shadow
        const transactions =
          walletType === ASSET_TYPES.MATIC
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
  }, [user?.walletAddress, walletType]);

  const handleCopyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(user?.walletAddress);
    setTooltipText(Constants.ADDRESS_COPIED);
  }, [user?.walletAddress]);

  useEffect(() => {
    if (openTransakBuyModal?.open) {
      openTransakBuyModalFunc(user?.walletAddress, dispatch);
    }
  }, [openTransakBuyModal?.open, user?.walletAddress, dispatch]);

  return (
    <TransactionContainer>
      <WalletContainer>
        <WalletAddressView
          user={user}
          tooltipText={tooltipText}
          handleCopyToClipboard={handleCopyToClipboard}
          walletType={walletType}
          setWalletType={setWalletType}
        />
        <WalletBalanceAndButtons
          walletType={walletType}
          user={user}
          triggerRefresh={triggerRefresh}
          setBalance={setBalance}
          closeButton={closeButton}
          dispatch={dispatch}
          handleSendClick={() => setShowTransferModal(true)}
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
        />
      )}
    </TransactionContainer>
  );
};

const WalletAddressView = ({
  user,
  tooltipText,
  handleCopyToClipboard,
  walletType,
  setWalletType
}) => {
  return (
    <WalletAddressBox>
      <Box sx={{ display: 'flex' }}>
        <Body
          fontWeight={600}
          lineHeight="1.5rem"
          sx={{ alignContent: 'center' }}
        >
          Address: {user.walletAddress}
        </Body>
        <Tooltip title={tooltipText} arrow placement={VARIANT.RIGHT}>
          <CopyButton onClick={handleCopyToClipboard}>
            <img src={clipboard} />
          </CopyButton>
        </Tooltip>
      </Box>
      <WalletSelect
        value={walletType}
        setValue={setWalletType}
        options={[ASSET_TYPES.MATIC, ASSET_TYPES.IDEACOINS, ASSET_TYPES.NFT]}
        backgroundColor="transparent"
      />
    </WalletAddressBox>
  );
};

export const WalletButtons = ({
  closeButton,
  user,
  dispatch,
  handleSendClick
}) => {
  return (
    <Box sx={{ display: 'flex', height: '3rem' }}>
      {closeButton && user?.roles?.includes(USER_ROLES.INFLUENCER) && (
        <ConnectButton>
          <img src={card} />
          <Body fontWeight={500} lineHeight="1.5rem">
            Connect Account
          </Body>
        </ConnectButton>
      )}
      <BuyButton
        onClick={() =>
          dispatch(
            Actions.openTransakBuyModal({
              openTransakBuyModalObj: {
                open: true
              }
            })
          )
        }
      >
        <img src={cart} />
        <Body fontWeight={500} lineHeight="1.5rem">
          Buy MATIC
        </Body>
      </BuyButton>
      <SendButton onClick={handleSendClick}>
        <img src={send} />
        <Body fontWeight={500} lineHeight="1.5rem">
          Send
        </Body>
      </SendButton>
      <SwapButton>
        <img src={swap} />
        <Body fontWeight={500} lineHeight="1.5rem">
          Swap
        </Body>
      </SwapButton>
    </Box>
  );
};
