import React from 'react';
import { Box } from '@mui/material';
import useRouter from 'hooks/useRouter';
import { Balance } from 'components/MyWallet/Balance';
import { ButtonWrapper, BuyButton } from 'components/MyWallet/styledComponents';
import { Body } from '../common/StyledComponents';
import { ASSET_TYPES } from 'utilities/constants';
import { WalletButtons } from './WalletButtons';

interface WalletBalanceAndButtonsProps {
  walletType: string;
  address: string;
  user: unknown;
  triggerRefresh: number;
  // eslint-disable-next-line no-unused-vars
  setBalance: (balance: number) => void;
  closeButton?: React.ReactNode;
  // eslint-disable-next-line no-unused-vars
  dispatch: (action: unknown) => void;
  handleSendClick: () => void;
  onViewMarketplaceClick?: () => void;
}

export const WalletBalanceAndButtons = ({
  walletType,
  address,
  user,
  triggerRefresh,
  setBalance,
  closeButton,
  dispatch,
  handleSendClick,
  onViewMarketplaceClick
}: WalletBalanceAndButtonsProps) => {
  const router = useRouter();

  return (
    <ButtonWrapper>
      <Box>
        {walletType === ASSET_TYPES.NFT ? (
          <BuyButton
            onClick={() => {
              router.push('/marketplace?tab=my-collections');
              onViewMarketplaceClick?.();
            }}
          >
            <Body
              fontWeight={500}
              lineHeight="1.5rem"
              sx={{ whiteSpace: 'nowrap', color: 'white' }}
            >
              View marketplace
            </Body>
          </BuyButton>
        ) : (
          <Balance
            address={address}
            refresh={triggerRefresh}
            setWalletBalance={setBalance}
            type={walletType}
          />
        )}
      </Box>
      <WalletButtons
        closeButton={closeButton}
        dispatch={dispatch}
        handleSendClick={handleSendClick}
        user={user}
        walletType={walletType}
      />
    </ButtonWrapper>
  );
};
