import React, { Dispatch, useCallback } from 'react';
import Config from 'config/config';
import { Token } from 'interface/common';
import { Constants, TRANSACTION_TYPE } from 'utilities/constants';
import { TxApprovalModal } from 'modals/TxApprovalModal';
import { nftDetailActions } from '../../nftDetailState/actions';
import DrawerCloseButton from 'components/common/buttons/DrawerCloseButton';
import NftDetailCard from '../../NftDetailCard';
import SaleTypeCard from '../../SaleTypeCard';
import NftSummaryCard from '../../NftSummaryCard';
import PriceInputCard from '../../PriceInputsCard';
import { PaymentTokenSection } from '../../PaymentTokenSection';
import {
  NftDetailAction,
  NftDetailState
} from '../../nftDetailState/interfaces';
import { Profile } from 'components/CardProfile';
import {
  StyledDrawerHeaderBox,
  StyledDrawerRoot,
  StyledFooterBar,
  StyledScrollBody
} from '../styledComponents';

interface ReduxAction {
  type: string;
  payload?: unknown;
}

// eslint-disable-next-line no-unused-vars
type ReduxDispatch = (action: ReduxAction) => void;

interface TxApprovalModalObjType {
  gasFee?: number;
  open?: boolean;
  type: string;
  walletAddress?: string;
  purchaseAmount?: string;
}

interface RenderListForSaleContentProps {
  nft: Token;
  listPrice: number;
  maticPrice?: number;
  nftDetailState: NftDetailState;
  localDispatch: Dispatch<NftDetailAction>;
  setListPrice: React.Dispatch<React.SetStateAction<number>>;
  isMediumScreen: boolean;
  user: Profile;
  dispatch: ReduxDispatch;
  isNftExpired: boolean;
  isListLoading: boolean;
  transactionHash: string;
  modalProps: {
    show: boolean;
    onConfirm?: () => Promise<void>;
    onReject?: () => void;
    transactionType?: TRANSACTION_TYPE;
    open?: boolean;
    type?: string;
  };
  txApprovalModalObj: TxApprovalModalObjType;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  onQuotationRequestWarning?: () => void;
}

export const RenderListForSaleContent: React.FC<
  RenderListForSaleContentProps
> = ({
  nft,
  listPrice,
  maticPrice,
  nftDetailState,
  localDispatch,
  setListPrice,
  isMediumScreen,
  user,
  dispatch,
  isNftExpired,
  isListLoading,
  transactionHash,
  modalProps,
  txApprovalModalObj,
  setOpen,
  onQuotationRequestWarning
}) => {
  const handleSaleTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const saleType = event.target.value as Constants.FIXED | Constants.AUCTION;
    localDispatch(nftDetailActions.setState({ saleType }));
    localDispatch(
      nftDetailActions.setState({
        showDuration: saleType === Constants.AUCTION
      })
    );
  };

  const removeNonNumericChars = (value: string): string => {
    return value.replace(/[^0-9.]/gu, '');
  };

  const formatPriceString = (price: string): string => {
    const parts = price.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts.length === 2 && parts[1].length > 4) {
      return parts[0] + '.' + parts[1].substring(0, 4);
    }
    return price;
  };

  const parsePriceValue = (priceString: string): number => {
    if (priceString === '' || priceString === '.') {
      return 0;
    }
    return parseFloat(priceString);
  };

  const isValidPriceFormat = (price: string): boolean => {
    return /^\d*\.?\d{0,4}$/gu.test(price);
  };

  const handleNftPriceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = event.target.value;
      if (inputValue === '') {
        setListPrice(0);
        return;
      }

      const numericPrice = removeNonNumericChars(inputValue);
      const formattedPrice = formatPriceString(numericPrice);

      if (isValidPriceFormat(formattedPrice)) {
        const numValue = parsePriceValue(formattedPrice);
        if (
          !isNaN(numValue) ||
          formattedPrice === '' ||
          formattedPrice === '.'
        ) {
          setListPrice(numValue);
        }
      }
    },
    [setListPrice]
  );

  return (
    <StyledDrawerRoot>
      {modalProps.show && (
        <TxApprovalModal
          destAddress={Config.MARKETPLACE_CONTRACT_ADDRESS}
          from={txApprovalModalObj.walletAddress || user?.walletAddress}
          gasFee={String(txApprovalModalObj.gasFee ?? '')}
          onConfirm={modalProps.onConfirm}
          onReject={modalProps.onReject}
          open={txApprovalModalObj.open}
          transactionType={modalProps.transactionType}
          type={txApprovalModalObj.type}
        />
      )}
      <StyledDrawerHeaderBox>
        <DrawerCloseButton title={Constants.LIST_FOR_SALE} setOpen={setOpen} />
      </StyledDrawerHeaderBox>
      <StyledScrollBody>
        <NftDetailCard
          nft={nft}
          listPrice={listPrice}
          maticPrice={maticPrice}
          paymentTokenType={nftDetailState.paymentTokenType}
        />
        <SaleTypeCard
          saleType={nftDetailState.saleType}
          onSaleTypeChange={handleSaleTypeChange}
        />
        <PaymentTokenSection
          localDispatch={localDispatch}
          nftDetailState={nftDetailState}
        />
        <PriceInputCard
          listPrice={listPrice}
          onPriceChange={handleNftPriceChange}
          showDuration={nftDetailState.showDuration}
          errorMessage={nftDetailState.errorMessage}
          nftDetailState={nftDetailState}
          localDispatch={localDispatch}
        />
      </StyledScrollBody>
      <StyledFooterBar>
        <NftSummaryCard
          listPrice={listPrice}
          maticPrice={maticPrice}
          paymentTokenType={nftDetailState.paymentTokenType}
          localDispatch={localDispatch}
          nft={nft}
          nftDetailState={nftDetailState}
          isMediumScreen={isMediumScreen}
          user={user}
          dispatch={dispatch}
          isNftExpired={isNftExpired}
          isListLoading={isListLoading}
          transactionHash={transactionHash}
          modalProps={modalProps}
          txApprovalModalObj={txApprovalModalObj}
          onQuotationRequestWarning={onQuotationRequestWarning}
        />
      </StyledFooterBar>
    </StyledDrawerRoot>
  );
};
