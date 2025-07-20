import React, { useEffect, useMemo } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Problem } from 'components/CardProblem';
import { Product } from 'components/CardProduct';
import { Solution } from 'components/CardSolution';
import { Tag, TagInfo } from 'components/CardTag';
import { Body } from 'components/common/StyledComponents';
import {
  FromBox,
  CenterBox,
  StyledArrowInwards,
  StyledArrowOutward,
  StyledLink,
  StyledMainBox,
  StyledTypography,
  SuccessPill,
  PendingPill,
  FailedPill
} from 'components/MyWallet/styledComponents';
import TableView from 'components/TableView';
import { getHeaders } from 'components/TableView/getHeaders';
import Config from 'config/config';
import { PsRecord } from 'dataPrvider';
import { ethers } from 'ethers';
import { GetUser } from 'redux-state/selectors';
import { ASSET_TYPES, Constants } from 'utilities/constants';

export type Transaction = PsRecord & {
  block_timestamp: string;
  body?: string;
  from_address: string;
  hash: string;
  id?: string | number;
  ideaPoints?: number;
  isFiled?: boolean;
  isLocked?: boolean;
  nftTransactionUrl?: string;
  parentProduct?: Product;
  parentProductTitle?: string;
  problem?: Problem | Array<Problem>;
  problems?: Array<Problem>;
  receiptStatus?: string;
  solutions?: Array<Solution>;
  status?: string;
  tagsInfo?: Array<TagInfo> | Array<Tag>;
  to_address: string;
  value: string;
};

interface TransactionViewProps {
  fetchTransactions: any;
  loading: boolean;
  refresh: number;
  transactions: Transaction[];
  walletType: string;
}

export const TransactionsView: React.FC<TransactionViewProps> = ({
  fetchTransactions,
  loading,
  refresh,
  transactions,
  walletType
}) => {
  const user = GetUser();

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, refresh]);

  const formatString = (str) => {
    if (str) {
      const lower = str.toLowerCase();
      const start = lower.slice(0, 7);
      const end = lower.slice(-4);
      return `${start}..${end}`;
    }
  };

  const getCells = useMemo(() => {
    return (icon, item) => {
      const transactionHashKey =
        walletType === ASSET_TYPES.MATIC
          ? Constants.MATIC_HASH
          : Constants.IDEACOIN_HASH;
      const transactionHash = item[transactionHashKey];
      const baseCells = {
        hash: (
          <StyledLink
            href={`${Config.SEPOLIA_BASE_URL}/${Constants.TX}/${transactionHash}`}
            target={Constants._BLANK}
            rel={Constants.NO_OPENER_NO_REFFERRER}
          >
            {formatString(transactionHash)}
          </StyledLink>
        ),
        from: (
          <FromBox>
            <StyledLink
              href={`${Config.SEPOLIA_BASE_URL}/${Constants.ADDRESS}/${item.from_address}`}
              target={Constants._BLANK}
              rel={Constants.NO_OPENER_NO_REFFERRER}
            >
              {`${formatString(item.from_address)} `}
            </StyledLink>
            {item.from_address.toLowerCase() ===
            user?.walletAddress.toLowerCase() ? (
              <StyledArrowOutward />
            ) : (
              <StyledArrowInwards />
            )}
          </FromBox>
        ),
        to: (
          <StyledLink
            href={`${Config.SEPOLIA_BASE_URL}/${Constants.ADDRESS}/${item.to_address}`}
            target={Constants._BLANK}
            rel={Constants.NO_OPENER_NO_REFFERRER}
          >
            {formatString(item.to_address)}
          </StyledLink>
        )
      };

      if (walletType === ASSET_TYPES.NFT) {
        baseCells['Nft Ids'] = (
          <StyledTypography>{item.token_id}</StyledTypography>
        );
        baseCells['Timestamp'] = (
          <StyledTypography>
            {new Date(item.block_timestamp).toLocaleString()}
          </StyledTypography>
        );
        baseCells['Status'] = (
          <Box height="1.75rem">
            {item?.block_number !== null && item?.block_number !== undefined ? (
              <SuccessPill>Success</SuccessPill>
            ) : (
              <FailedPill>Failed</FailedPill>
            )}
          </Box>
        );
      } else {
        baseCells['Value'] = (
          <StyledTypography>
            {ethers.utils.formatEther(item.value)}
          </StyledTypography>
        );
        baseCells['Timestamp'] = (
          <StyledTypography>
            {new Date(item.block_timestamp).toLocaleString()}
          </StyledTypography>
        );
        baseCells['Status'] = (
          <Box height="1.75rem">
            {item?.block_number !== null && item?.block_number !== undefined ? (
              <SuccessPill>Success</SuccessPill>
            ) : (
              <FailedPill>Failed</FailedPill>
            )}
          </Box>
        );
      }
      return baseCells;
    };
  }, [user?.walletAddress, walletType]);

  const rows = {
    component: (icon, item) => getCells(icon, item),
    items: transactions,
    pinnedItems: []
  };

  const headers: Array<string> = useMemo(() => {
    if (walletType === ASSET_TYPES.NFT) {
      return getHeaders(Constants.ACCOUNT_NFT_TRANSACTIONS, user, true);
    } else {
      return getHeaders(Constants.ACCOUNT_TRANSACTIONS, user, true);
    }
  }, [user, walletType]);

  const shouldShowTransactions = !loading && transactions.length > 0;

  return (
    <StyledMainBox>
      {loading ? (
        <CenterBox sx={{ marginTop: '1rem' }}>
          <CircularProgress />
        </CenterBox>
      ) : shouldShowTransactions ? (
        <TableView
          headers={headers}
          rows={rows}
          showPaginations={false}
          hasWalletFixedCellWidth={true}
          cellWidths={['16.66%', '16.66%', '16.66%', '16.66%', '16.66%']}
        />
      ) : (
        <CenterBox>
          <Body sx={{ marginTop: '1rem' }}>{Constants.NO_TRANSACTION_YET}</Body>
        </CenterBox>
      )}
    </StyledMainBox>
  );
};
