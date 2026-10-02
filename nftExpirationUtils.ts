import { Constants, NUMBERS } from 'utilities/constants';
import { addDaysToDate } from './utils';
import { useEffect, useMemo, useState } from 'react';

export interface NftCardTimeline {
  isAuction: boolean;
  isAuctionNotStarted: boolean;
  isAuctionLive: boolean;
  isAuctionExpired: boolean;
  isPatentExpired: boolean;
  timerTarget: Date;
  nextTransitionAt: number | null;
}

const MAX_TIMEOUT_MS = 2147483647;
const TRANSITION_BUFFER_MS = 250;

const toTimestamp = (value?: Date | string | null): number | null => {
  if (value === null || value === undefined) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getAuctionTimeline = (
  auctionStartTimestamp: number | null,
  auctionEndTimestamp: number | null,
  now: number,
  isPatentExpired: boolean,
  yearlyExpiryTimestamp: number | null,
  yearlyExpiryDate: Date
): NftCardTimeline => {
  if (auctionStartTimestamp !== null && auctionStartTimestamp > now) {
    return {
      isAuction: true,
      isAuctionNotStarted: true,
      isAuctionLive: false,
      isAuctionExpired: false,
      isPatentExpired,
      timerTarget: new Date(auctionStartTimestamp),
      nextTransitionAt: auctionStartTimestamp
    };
  }

  if (auctionEndTimestamp !== null && auctionEndTimestamp > now) {
    return {
      isAuction: true,
      isAuctionNotStarted: false,
      isAuctionLive: true,
      isAuctionExpired: false,
      isPatentExpired,
      timerTarget: new Date(auctionEndTimestamp),
      nextTransitionAt: auctionEndTimestamp
    };
  }

  return {
    isAuction: true,
    isAuctionNotStarted: false,
    isAuctionLive: false,
    isAuctionExpired: true,
    isPatentExpired,
    timerTarget: yearlyExpiryDate,
    nextTransitionAt: isPatentExpired ? null : yearlyExpiryTimestamp
  };
};

const getDefaultTimeline = (
  isPatentExpired: boolean,
  yearlyExpiryTimestamp: number | null,
  yearlyExpiryDate: Date
): NftCardTimeline => ({
  isAuction: false,
  isAuctionNotStarted: false,
  isAuctionLive: false,
  isAuctionExpired: false,
  isPatentExpired,
  timerTarget: yearlyExpiryDate,
  nextTransitionAt: isPatentExpired ? null : yearlyExpiryTimestamp
});

export const getNftCardTimeline = (
  createdAt?: Date | string | null,
  onAuction?: boolean,
  expiryDate?: Date | string | null,
  auctionStartTime?: Date | string | null,
  now: number = Date.now()
): NftCardTimeline => {
  const createdTimestamp = toTimestamp(createdAt);
  const yearlyExpiryTimestamp =
    createdTimestamp !== null
      ? addDaysToDate(new Date(createdTimestamp), NUMBERS.YEAR).getTime()
      : null;
  const isPatentExpired =
    yearlyExpiryTimestamp !== null && yearlyExpiryTimestamp <= now;
  const yearlyExpiryDate =
    yearlyExpiryTimestamp !== null
      ? new Date(yearlyExpiryTimestamp)
      : new Date(now);

  if (onAuction && expiryDate) {
    return getAuctionTimeline(
      toTimestamp(auctionStartTime),
      toTimestamp(expiryDate),
      now,
      isPatentExpired,
      yearlyExpiryTimestamp,
      yearlyExpiryDate
    );
  }

  return getDefaultTimeline(
    isPatentExpired,
    yearlyExpiryTimestamp,
    yearlyExpiryDate
  );
};

export const useNftCardTimeline = (
  createdAt?: Date | string | null,
  onAuction?: boolean,
  expiryDate?: Date | string | null,
  auctionStartTime?: Date | string | null
): NftCardTimeline => {
  const [now, setNow] = useState<number>(() => Date.now());

  const timeline = useMemo(
    () =>
      getNftCardTimeline(
        createdAt,
        onAuction,
        expiryDate,
        auctionStartTime,
        now
      ),
    [createdAt, onAuction, expiryDate, auctionStartTime, now]
  );

  useEffect(() => {
    if (timeline.nextTransitionAt === null) return;
    const delay = Math.min(
      timeline.nextTransitionAt - Date.now() + TRANSITION_BUFFER_MS,
      MAX_TIMEOUT_MS
    );
    if (delay <= 0) {
      setNow(Date.now());
      return;
    }
    const timeout = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timeout);
  }, [timeline.nextTransitionAt]);

  return timeline;
};

export interface NftCardTimerRow {
  label: string;
  expiryMs: number;
}

const getPatentExpiryMs = (createdAt?: Date | string | null): number | null => {
  const createdTimestamp = toTimestamp(createdAt);
  if (createdTimestamp === null) return null;
  return addDaysToDate(new Date(createdTimestamp), NUMBERS.YEAR).getTime();
};

export const getNftCardTimerRows = (
  timeline: NftCardTimeline,
  createdAt?: Date | string | null
): NftCardTimerRow[] => {
  const patentExpiryMs = getPatentExpiryMs(createdAt);
  const primaryMs = timeline.timerTarget.getTime();

  const patentTimerRow = (): NftCardTimerRow | null => {
    if (patentExpiryMs === null || timeline.isPatentExpired) return null;
    return {
      label: Constants.PATENT_TOKEN_EXPIRES_IN,
      expiryMs: patentExpiryMs
    };
  };

  if (timeline.isAuctionNotStarted) {
    const rows: NftCardTimerRow[] = [
      { label: Constants.AUCTION_STARTS_IN, expiryMs: primaryMs }
    ];
    const patent = patentTimerRow();
    if (patent) rows.push(patent);
    return rows;
  }

  if (timeline.isAuctionLive) {
    const rows: NftCardTimerRow[] = [
      { label: Constants.AUCTION_ENDS_IN, expiryMs: primaryMs }
    ];
    const patent = patentTimerRow();
    if (patent) rows.push(patent);
    return rows;
  }

  return [
    {
      label: Constants.PATENT_TOKEN_EXPIRES_IN,
      expiryMs: primaryMs
    }
  ];
};
