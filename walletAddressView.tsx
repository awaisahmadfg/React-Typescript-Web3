import React from 'react';
import { Box, Tooltip } from '@mui/material';
import clipboard from 'assets/icons/clipboard.png';
import eyeIcon from 'assets/icons/eyeIcon.svg';
import {
  CopyButton,
  WalletAddressBox
} from 'components/MyWallet/styledComponents';
import { WalletSelect } from 'components/MyWallet/WalletSelect';
import { ASSET_TYPES, VARIANT } from 'utilities/constants';
import { usePrivateKey } from './hooks/usePrivateKey';
import { Body } from '../common/StyledComponents';

interface WalletAddressViewProps {
  activeProfile: {
    id?: string;
    walletAddress?: string;
    privateKey?: string;
  };
  tooltipText: string;
  handleCopyToClipboard: () => void;
  walletType: string;
  setWalletType: any;
  isCurrentUserProfile?: boolean;
}

export const WalletAddressView: React.FC<WalletAddressViewProps> = ({
  activeProfile,
  tooltipText,
  handleCopyToClipboard,
  walletType,
  setWalletType,
  isCurrentUserProfile = false
}) => {
  const {
    showPrivateKey,
    privateKeyTooltip,
    privateKey,
    loadingPrivateKey,
    handleTogglePrivateKey,
    handleCopyPrivateKey
  } = usePrivateKey({ activeProfile, isCurrentUserProfile });

  const maskedPrivateKey =
    '********************************************************';

  return (
    <WalletAddressBox>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Body fontWeight={600} lineHeight="1.5rem">
            Address: {activeProfile.walletAddress}
          </Body>
          <Tooltip title={tooltipText} arrow placement={VARIANT.RIGHT}>
            <CopyButton onClick={handleCopyToClipboard}>
              <img src={clipboard} />
            </CopyButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Body fontWeight={600} lineHeight="1.5rem">
            Private Key:{' '}
            {loadingPrivateKey
              ? 'Loading...'
              : showPrivateKey && privateKey
                ? privateKey
                : maskedPrivateKey}
          </Body>
          {showPrivateKey && privateKey && (
            <Tooltip title={privateKeyTooltip} arrow placement={VARIANT.RIGHT}>
              <CopyButton onClick={handleCopyPrivateKey}>
                <img src={clipboard} />
              </CopyButton>
            </Tooltip>
          )}
          <Tooltip
            title={showPrivateKey ? 'Hide private key' : 'View private key'}
            arrow
            placement={VARIANT.RIGHT}
          >
            <CopyButton onClick={handleTogglePrivateKey}>
              <img src={eyeIcon} alt="Toggle private key" />
            </CopyButton>
          </Tooltip>
        </Box>
      </Box>
      <WalletSelect
        value={walletType}
        setValue={setWalletType}
        options={[ASSET_TYPES.ETHEREUM, ASSET_TYPES.IDEACOINS, ASSET_TYPES.NFT]}
        backgroundColor="transparent"
      />
    </WalletAddressBox>
  );
};
