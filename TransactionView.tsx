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
  FailedPill
} from 'components/MyWallet/styledComponents';
import TableView from 'components/TableView';
import { getHeaders } from 'components/TableView/getHeaders';
import {
  getBlockExplorerBaseUrl,
  getExplorerAddressUrl,
  getExplorerNftTokenUrl,
  getExplorerTxUrl,
  getPublicContract
} from 'helpers/publicBlockchainConfig';
import { PsRecord } from 'dataPrvider';
import { ethers } from 'ethers';
import { GetUser } from 'redux-state/selectors';
import { ASSET_TYPES, Constants, NUMBERS } from 'utilities/constants';

export type Transaction = PsRecord & {
  block_timestamp: string;
  body?: string;
  from_address: string;
  hash: string;
  id?: string | number;
  ideaPoints?: number;
  isFiled?: boolean;
  isLocked?: boolean;
  nftId?: string;
  nftTitle?: string;
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
  fetchTransactions: () => void;
  loading: boolean;
  refresh: number;
  transactions: Transaction[];
  walletType: string;
  viewingWalletAddress?: string;
}

const ADDR_PREVIEW_HEAD = NUMBERS.SEVEN;
const ADDR_PREVIEW_TAIL = NUMBERS.FOUR;

function formatTransferValueForWallet(walletType: string, raw: string): string {
  if (walletType === ASSET_TYPES.USDT) {
    try {
      return ethers.utils.formatUnits(raw, NUMBERS.SIX);
    } catch {
      return raw;
    }
  }
  return ethers.utils.formatEther(raw);
}

export const TransactionsView: React.FC<TransactionViewProps> = ({
  fetchTransactions,
  loading,
  refresh,
  transactions,
  walletType,
  viewingWalletAddress
}) => {
  const user = GetUser();
  const walletForDirection =
    viewingWalletAddress?.toLowerCase() || user?.walletAddress?.toLowerCase();

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, refresh]);

  const formatString = (str) => {
    if (str) {
      const lower = str.toLowerCase();
      const start = lower.slice(0, ADDR_PREVIEW_HEAD);
      const end = lower.slice(-ADDR_PREVIEW_TAIL);
      return `${start}..${end}`;
    }
  };

  const getCells = useMemo(() => {
    return (icon, item) => {
      const transactionHashKey =
        walletType === ASSET_TYPES.ETHEREUM
          ? Constants.MATIC_HASH
          : Constants.IDEACOIN_HASH;
      const transactionHash = item[transactionHashKey];
      const baseCells = {
        hash: (
          <StyledLink
            href={getExplorerTxUrl(transactionHash)}
            target={Constants._BLANK}
            rel={Constants.NO_OPENER_NO_REFFERRER}
          >
            {formatString(transactionHash)}
          </StyledLink>
        ),
        from: (
          <FromBox>
            <StyledLink
              href={getExplorerAddressUrl(item.from_address)}
              target={Constants._BLANK}
              rel={Constants.NO_OPENER_NO_REFFERRER}
            >
              {`${formatString(item.from_address)} `}
            </StyledLink>
            {item.from_address.toLowerCase() === walletForDirection ? (
              <StyledArrowOutward />
            ) : (
              <StyledArrowInwards />
            )}
          </FromBox>
        ),
        to: (
          <StyledLink
            href={getExplorerAddressUrl(item.to_address)}
            target={Constants._BLANK}
            rel={Constants.NO_OPENER_NO_REFFERRER}
          >
            {formatString(item.to_address)}
          </StyledLink>
        )
      };

      if (walletType === ASSET_TYPES.NFT) {
        const nftHref = item?.nftId
          ? `/marketplace/${item.nftId}`
          : getExplorerNftTokenUrl(
              getPublicContract('marketplace'),
              item.token_id
            );
        const nftCells = {
          title: (
            <StyledLink
              href={nftHref}
              target={Constants._BLANK}
              rel={Constants.NO_OPENER_NO_REFFERRER}
              sx={{
                maxWidth: '10rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block'
              }}
              title={item.nftTitle}
            >
              {item?.nftTitle || '-'}
            </StyledLink>
          ),
          ...baseCells,
          'Patent Token Ids': (
            <StyledTypography>{item.token_id}</StyledTypography>
          ),
          Timestamp: (
            <StyledTypography>
              {new Date(item.block_timestamp).toLocaleString()}
            </StyledTypography>
          ),
          Status: (
            <Box height="1.75rem">
              {item?.block_number !== null &&
              item?.block_number !== undefined ? (
                <SuccessPill>Success</SuccessPill>
              ) : (
                <FailedPill>Failed</FailedPill>
              )}
            </Box>
          )
        };
        return nftCells;
      }
      baseCells['Value'] = (
        <StyledTypography>
          {formatTransferValueForWallet(walletType, item.value)}
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
    }
    return getHeaders(Constants.ACCOUNT_TRANSACTIONS, user, true);
  }, [user, walletType]);

  const shouldShowTransactions = !loading && transactions.length > 0;

  return (
    <StyledMainBox>
      {loading ? (
        <CenterBox sx={{ marginTop: '1rem' }}>
          <CircularProgress />
        </CenterBox>
      ) : shouldShowTransactions ? (
        <Box sx={{ overflowX: 'auto', width: '100%' }}>
          <TableView
            headers={headers}
            rows={rows}
            showPaginations={false}
            hasWalletFixedCellWidth={true}
            cellWidths={
              walletType === ASSET_TYPES.NFT
                ? [
                    '14.28%',
                    '14.28%',
                    '14.28%',
                    '14.28%',
                    '14.28%',
                    '14.28%',
                    '14.28%'
                  ]
                : ['16.66%', '16.66%', '16.66%', '16.66%', '16.66%', '16.66%']
            }
          />
        </Box>
      ) : (
        <CenterBox>
          <Body sx={{ marginTop: '1rem' }}>{Constants.NO_TRANSACTION_YET}</Body>
        </CenterBox>
      )}
    </StyledMainBox>
  );
};
