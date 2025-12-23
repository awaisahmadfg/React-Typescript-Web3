import React, { Dispatch, SetStateAction, useCallback, useMemo } from 'react';
import { Tag } from 'components/CardTag';
import { BaseModal } from 'modals/Common/BaseModal';
import { colorPalette } from 'theme';
import { Breakpoints } from 'utilities/constants';
import { StyledCloseButton, StyledCloseIcon } from './styledComponents';

import { MyNewWallet } from '../WalletComponent/Transactions';

interface MyWalletProps {
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  community?: Tag;
}

export const MyWallet: React.FC<MyWalletProps> = ({
  open,
  setOpen,
  community = null
}) => {
  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const CloseButton = useMemo(() => {
    return (
      <StyledCloseButton onClick={handleClose}>
        <StyledCloseIcon />
      </StyledCloseButton>
    );
  }, [handleClose]);

  return (
    <BaseModal
      open={open}
      onClose={handleClose}
      maxWidth={Breakpoints.EXTRA_LARGE}
      backgroundColor={colorPalette.black}
      borderRadius="1.5rem"
      scrollbarWidth="none"
      padding="1rem"
    >
      <MyNewWallet
        community={community}
        closeButton={CloseButton}
        onViewMarketplaceClick={handleClose}
      />
    </BaseModal>
  );
};
