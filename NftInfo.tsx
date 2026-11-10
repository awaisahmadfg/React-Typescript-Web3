import { useMemo } from 'react';
import { useTimer } from 'react-timer-hook';
import { Box, Tooltip } from '@mui/material';
import { Constants, NUMBERS, VARIANT } from 'utilities/constants';
import {
  getListingPaymentSymbol,
  isEthPaymentToken
} from 'helpers/paymentToken';
import { Token } from 'interface/common';
import { CardNameText } from '../MyWallet/styledComponents';
import Timer from '../Timer';
import {
  ExpireText,
  NameBox,
  ParentBox,
  PriceContainer,
  StyledSubTypography,
  TimerWrapper,
  UsdText
} from './styledComponents';
import { NftCardTimerRow } from './nftExpirationUtils';
import { CardMeta } from './CardMeta';

// Marketplace card sizes: title > price > meta (one step per level).
const CARD_TITLE_SX = {
  display: '-webkit-box',
  fontSize: '1.125rem',
  fontWeight: 600,
  lineHeight: 1.3,
  whiteSpace: 'normal',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  wordBreak: 'break-word'
};
const CARD_PRICE_SX = { fontSize: '1.375rem', lineHeight: 1.2 };
const CARD_SYMBOL_SX = {
  color: 'rgba(255, 255, 255, 0.64)',
  fontSize: '0.8125rem',
  fontWeight: 500
};

const renderListingPrice = ({
  isListed,
  isEthListing,
  usdPrice,
  maticPrice,
  paymentSymbol,
  large = false
}: {
  isListed: boolean;
  isEthListing: boolean;
  usdPrice?: number | string;
  maticPrice?: number | string;
  paymentSymbol: string;
  large?: boolean;
}) => {
  const amount = Number(isEthListing ? maticPrice : (maticPrice ?? usdPrice));
  const formattedAmount =
    isListed && Number.isFinite(amount)
      ? amount.toFixed(NUMBERS.SIX).replace(/\.?0+$/u, '')
      : ' ';

  return (
    <Tooltip
      title={`Listed in ${paymentSymbol}`}
      placement={VARIANT.TOP}
      disableInteractive
    >
      <UsdText sx={large ? CARD_PRICE_SX : undefined}>
        {formattedAmount}
        <StyledSubTypography sx={large ? CARD_SYMBOL_SX : undefined}>
          &nbsp;{paymentSymbol}
        </StyledSubTypography>
      </UsdText>
    </Tooltip>
  );
};

const toExpiryMs = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const Countdown = ({ expiryMs }: { expiryMs: number }) => {
  const expiryTimestamp = useMemo(() => new Date(expiryMs), [expiryMs]);
  const { seconds, minutes, hours, days } = useTimer({
    expiryTimestamp,
    autoStart: true
  });

  return (
    <Timer seconds={seconds} minutes={minutes} hours={hours} days={days} />
  );
};

const LabeledCountdown = ({ label, expiryMs }: NftCardTimerRow) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
    <ExpireText>{label}</ExpireText>
    <TimerWrapper>
      <Countdown expiryMs={expiryMs} />
    </TimerWrapper>
  </Box>
);

const ListedPriceBlock = ({
  isListed,
  onAuction,
  isEthListing,
  usdPrice,
  maticPrice,
  paymentSymbol,
  large = false
}: {
  isListed: boolean;
  onAuction: boolean;
  isEthListing: boolean;
  usdPrice?: number | string;
  maticPrice?: number | string;
  paymentSymbol: string;
  large?: boolean;
}) => {
  if (!isListed && !onAuction) {
    return null;
  }
  return (
    <PriceContainer>
      {renderListingPrice({
        isListed,
        isEthListing,
        usdPrice,
        maticPrice,
        paymentSymbol,
        large
      })}
    </PriceContainer>
  );
};

const CONTEST_TITLE_SX = {
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'normal',
  display: '-webkit-box',
  WebkitLineClamp: 5,
  WebkitBoxOrient: 'vertical',
  wordBreak: 'break-word'
};

const getTitleSx = (isCard: boolean, isContest: boolean) => {
  if (isCard) return CARD_TITLE_SX;
  return isContest ? CONTEST_TITLE_SX : {};
};

const NftTimers = ({
  rows,
  compact
}: {
  rows: NftCardTimerRow[];
  compact: boolean;
}) =>
  compact ? (
    <CardMeta rows={rows} />
  ) : (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {rows.map((row) => (
        <LabeledCountdown
          key={`${row.label}-${row.expiryMs}`}
          label={row.label}
          expiryMs={row.expiryMs}
        />
      ))}
    </Box>
  );

export const NftInfo = ({
  token,
  expiryTimestamp = null,
  cardTimers = null,
  isContest = false,
  variant = 'default'
}: {
  token: Token;
  expiryTimestamp?: Date | string | null;
  cardTimers?: NftCardTimerRow[] | null;
  isContest?: boolean;
  /** 'card': marketplace card hierarchy with compact timing lines. */
  variant?: 'default' | 'card';
}) => {
  const isCard = variant === 'card';
  const { name, maticPrice, usdPrice, isListed, onAuction, paymentToken } =
    token;
  const paymentSymbol = getListingPaymentSymbol(paymentToken);
  const isEthListing = isEthPaymentToken(paymentToken);

  const expiryTargetMs = toExpiryMs(expiryTimestamp);
  const expiryMs = expiryTargetMs ?? Date.now();
  const timerRows: NftCardTimerRow[] =
    cardTimers && cardTimers.length > 0
      ? cardTimers
      : [{ label: Constants.PATENT_TOKEN_EXPIRES_IN, expiryMs }];

  const displayName =
    isContest && name?.length > NUMBERS.FIFTY
      ? `${name.substring(0, NUMBERS.THREE_HUNDRED)}...`
      : name;

  return (
    <ParentBox>
      <NameBox>
        <CardNameText
          sx={getTitleSx(isCard, isContest)}
          title={isCard ? displayName : undefined}
        >
          {displayName}
        </CardNameText>
      </NameBox>
      <ListedPriceBlock
        isListed={isListed}
        onAuction={onAuction}
        isEthListing={isEthListing}
        usdPrice={usdPrice}
        maticPrice={maticPrice}
        paymentSymbol={paymentSymbol}
        large={isCard}
      />
      {!isContest && <NftTimers rows={timerRows} compact={isCard} />}
    </ParentBox>
  );
};
