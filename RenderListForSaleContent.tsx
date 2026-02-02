import React, { Dispatch, useCallback } from 'react';
import { Token } from 'interface/common';
import { DecoratedDivider } from 'components/common/DecoratedDivider';
import { VARIANT, Constants, TRANSACTION_TYPE } from 'utilities/constants';
import { nftDetailActions } from '../../nftDetailState/actions';
import DrawerCloseButton from 'components/common/buttons/DrawerCloseButton';
import NftDetailCard from '../../NftDetailCard';
import SaleTypeCard from '../../SaleTypeCard';
import NftSummaryCard from '../../NftSummaryCard';
import PriceInputCard from '../../PriceInputsCard';
import {
  NftDetailAction,
  NftDetailState
} from '../../nftDetailState/interfaces';
import { Profile } from 'components/CardProfile';
import {
  StyledContentBox,
  StyledContentLeftBox,
  StyledContentRightBox,
  StyledDecoratedDividerBox,
  StyledDrawerClosedBox
} from '../styledComponents';

interface RenderListForSaleContentProps {
  nft: Token;
  listPrice: number;
  maticPrice?: number;
  nftDetailState: NftDetailState;
  localDispatch: Dispatch<NftDetailAction>;
  setListPrice: React.Dispatch<React.SetStateAction<number>>;
  isMediumScreen: boolean;
  user: Profile;
  dispatch: any;
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
  txApprovalModalObj: any;
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
  const handleSaleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const saleType = e.target.value as Constants.FIXED | Constants.AUCTION;
    localDispatch(nftDetailActions.setState({ saleType }));
    if (saleType === Constants.AUCTION) {
      localDispatch(nftDetailActions.setState({ showDuration: true }));
    } else {
      localDispatch(nftDetailActions.setState({ showDuration: false }));
    }
  };

  const handleNftPriceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = event.target.value;
      if (inputValue === '') {
        setListPrice(0);
        return;
      }
      const newPrice = inputValue.replace(/[^0-9.]/gu, '');
      const parts = newPrice.split('.');
      let sanitizedPrice =
        parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : newPrice;
      if (parts.length === 2 && parts[1].length > 4) {
        sanitizedPrice = parts[0] + '.' + parts[1].substring(0, 4);
      }
      if (/^\d*\.?\d{0,4}$/gu.test(sanitizedPrice)) {
        // Convert to number, but preserve the string for display if it's a valid number
        const numValue =
          sanitizedPrice === '' || sanitizedPrice === '.'
            ? 0
            : parseFloat(sanitizedPrice);
        if (
          !isNaN(numValue) ||
          sanitizedPrice === '' ||
          sanitizedPrice === '.'
        ) {
          setListPrice(numValue);
        }
      }
    },
    [setListPrice]
  );

  return (
    <StyledContentBox>
      <StyledContentLeftBox>
        <StyledDrawerClosedBox>
          <DrawerCloseButton
            title={Constants.LIST_FOR_SALE}
            setOpen={setOpen}
          />
        </StyledDrawerClosedBox>
        <NftDetailCard
          nft={nft}
          listPrice={listPrice}
          maticPrice={maticPrice}
        />
        <SaleTypeCard
          saleType={nftDetailState.saleType}
          onSaleTypeChange={handleSaleTypeChange}
        />
        <PriceInputCard
          listPrice={listPrice}
          onPriceChange={handleNftPriceChange}
          showDuration={nftDetailState.showDuration}
          errorMessage={nftDetailState.errorMessage}
          nftDetailState={nftDetailState}
          localDispatch={localDispatch}
        />
      </StyledContentLeftBox>
      <StyledDecoratedDividerBox>
        <DecoratedDivider orientation={VARIANT.VERTICAL} />
      </StyledDecoratedDividerBox>
      <StyledContentRightBox>
        <NftSummaryCard
          listPrice={listPrice}
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
      </StyledContentRightBox>
    </StyledContentBox>
  );
};
