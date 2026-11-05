import React, { Dispatch, useEffect, useState } from 'react';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { Constants, VARIANT } from 'utilities/constants';
import { nftDetailActions } from './nftDetailState/actions';
import { NftDetailAction, NftDetailState } from './nftDetailState/interfaces';
import { StyledDurationSectionMainBox } from './utils/styledComponents';
import { handleDurationSelect } from './utils';
import { colorPalette, useIsMediumScreen } from 'theme';
import {
  StyledDatePickerLabel,
  StyledDatePickerMainBox,
  StyledDatePickerSubBox,
  StyledDurationDropDownBox,
  StyledDurationFormControl,
  StyledDurationMenuItem,
  StyledDurationSelect,
  StyledDurationTypography,
  StyledDatePickerTextField
} from './NftListForSaleDrawer/stylesComponent';

interface NftDurationProps {
  localDispatch: Dispatch<NftDetailAction>;
  nftDetailState: NftDetailState;
}

const DURATION_OPTIONS = [
  Constants.ONE_HOUR_TEXT,
  Constants.SIX_HOURS_TEXT,
  Constants.ONE_DAY_TEXT,
  Constants.THREE_DAYS_TEXT,
  Constants.SEVEN_DAYS_TEXT,
  Constants.ONE_MONTH_TEXT,
  Constants.THREE_MONTHS_TEXT,
  Constants.SIX_MONTHS_TEXT
];

const NftDuration: React.FC<NftDurationProps> = ({
  localDispatch,
  nftDetailState
}) => {
  const isMediumScreen = useIsMediumScreen();
  return (
    <StyledDurationSectionMainBox isMediumScreen={isMediumScreen}>
      <StyledDurationDropDownBox>
        <StyledDurationTypography>
          {Constants.DURATION}
        </StyledDurationTypography>
        <StyledDurationFormControl fullWidth>
          <StyledDurationSelect
            defaultValue={Constants.ONE_HOUR_TEXT}
            onOpen={() =>
              localDispatch(nftDetailActions.setState({ dropDownOpen: true }))
            }
            onClose={() =>
              localDispatch(nftDetailActions.setState({ dropDownOpen: false }))
            }
            IconComponent={
              nftDetailState.dropDownOpen
                ? KeyboardArrowUpIcon
                : KeyboardArrowDownIcon
            }
            MenuProps={{
              anchorOrigin: {
                vertical: 'bottom',
                horizontal: 'center'
              },
              PaperProps: {
                sx: {
                  backgroundColor: colorPalette.darkBlackPurple,
                  border: `0.0625rem solid ${colorPalette.lightMidnightBlue}`,
                  borderRadius: '0.625rem',
                  padding: '0.5rem'
                }
              }
            }}
          >
            <StyledDurationMenuItem
              value={Constants.CUSTOM}
              onClick={() =>
                localDispatch(
                  nftDetailActions.setState({ datePickerOpen: true })
                )
              }
            >
              {Constants.CUSTOM}
            </StyledDurationMenuItem>
            {DURATION_OPTIONS.map((option) => (
              <StyledDurationMenuItem
                key={option}
                value={option}
                onClick={() => handleDurationSelect(option, localDispatch)}
              >
                {option}
              </StyledDurationMenuItem>
            ))}
          </StyledDurationSelect>
        </StyledDurationFormControl>
      </StyledDurationDropDownBox>

      {nftDetailState.datePickerOpen && (
        <DatePickerSection
          localDispatch={localDispatch}
          nftDetailState={nftDetailState}
        />
      )}
    </StyledDurationSectionMainBox>
  );
};

const DatePickerSection: React.FC<NftDurationProps> = ({
  localDispatch,
  nftDetailState
}) => {
  const [startDateError, setStartDateError] = useState('');
  const [endDateError, setEndDateError] = useState('');

  const validateDates = (start: Date, end: Date) => {
    const now = Date.now(); // Current UTC timestamp
    const startTime = start.getTime();
    const endTime = end.getTime();
    const startErrors: string[] = [];
    const endErrors: string[] = [];

    if (startTime < now) {
      startErrors.push(
        'Start time must be greater than equal to the current time.'
      );
    }
    if (startTime >= endTime) {
      startErrors.push('Start time must be before the end time.');
    }

    if (endTime <= now) {
      endErrors.push('End time must be greater then the current time.');
    }
    if (endTime <= startTime) {
      endErrors.push('End time must be after the start time.');
    }

    setStartDateError(startErrors.join(' • '));
    setEndDateError(endErrors.join(' • '));
    localDispatch(
      nftDetailActions.setState({
        startDateError: startErrors.join(' • '),
        endDateError: endErrors.join(' • ')
      })
    );
  };

  const handleStartDateChange = (e) => {
    const newStartDate = new Date(e.target.value);
    localDispatch(nftDetailActions.setState({ startDate: newStartDate }));
  };

  const handleEndDateChange = (e) => {
    const newEndDate = new Date(e.target.value);
    localDispatch(nftDetailActions.setState({ endDate: newEndDate }));
  };

  useEffect(() => {
    validateDates(nftDetailState.startDate, nftDetailState.endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nftDetailState.startDate, nftDetailState.endDate]);

  const formatDate = (date: Date) => {
    const pad = (num: number) => num.toString().padStart(2, '0');
    const localDate = new Date(date);
    return `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}T${pad(localDate.getHours())}:${pad(localDate.getMinutes())}`;
  };

  return (
    <StyledDatePickerMainBox>
      <StyledDatePickerSubBox>
        <StyledDatePickerLabel>Start</StyledDatePickerLabel>
        <StyledDatePickerTextField
          value={formatDate(nftDetailState.startDate)}
          onChange={handleStartDateChange}
          type={VARIANT.DATE_TIME_LOCAL}
          variant={VARIANT.OUTLINED}
          fullWidth
          error={!!startDateError}
          helperText={startDateError}
          InputLabelProps={{
            shrink: true
          }}
        />
      </StyledDatePickerSubBox>
      <StyledDatePickerSubBox>
        <StyledDatePickerLabel>End</StyledDatePickerLabel>
        <StyledDatePickerTextField
          value={formatDate(nftDetailState.endDate)}
          onChange={handleEndDateChange}
          type={VARIANT.DATE_TIME_LOCAL}
          variant={VARIANT.OUTLINED}
          fullWidth
          error={!!endDateError}
          helperText={endDateError}
          InputLabelProps={{
            shrink: true
          }}
        />
      </StyledDatePickerSubBox>
    </StyledDatePickerMainBox>
  );
};

export default NftDuration;
