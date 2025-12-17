import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { ActionButton } from 'components/common/StyledComponents';
import { openTransakBuyModalFunc } from 'helpers/index';
import { deployNFT, onTxConfirm } from 'helpers/nftDeploymentService';
import Actions from 'redux-state/actions';
import useRouter from 'hooks/useRouter';
import { Application } from 'interface/common';
import { TxApprovalModal } from 'modals/TxApprovalModal';
import PopUpModal from 'modals/PopUpModal';
import SuccessIcon from 'assets/icons/SuccessIcon.svg';
import {
  GetNftDeployStartLoader,
  GetOpenTransakBuyModalObj,
  GetTokenURI,
  GetTxApprovalModalObj,
  GetUser,
  GetProfileInventions
} from 'redux-state/selectors';
import { colorPalette } from 'theme';
import { ASSET_TYPES, Constants } from 'utilities/constants';

interface DeployNftButtonProps {
  invention: Application;
  variant: 'small' | 'medium';
}

const getNftDeploymentMessage = (inventionItem: Application) => {
  return inventionItem?.deployingStatus === 'deployed'
    ? Constants.LIST_YOUR_NFT_TEXT
    : Constants.DEPLOY_NFT;
};

type RouterType = ReturnType<typeof useRouter>;
type InventionsType = ReturnType<typeof GetProfileInventions>;
type UserType = ReturnType<typeof GetUser>;
type TxApprovalModalObjType = ReturnType<typeof GetTxApprovalModalObj>;
// eslint-disable-next-line no-unused-vars
type OpenTxApprovalModalFn = (gasFee: number, type: string) => void;

interface DeployNftButtonContentProps {
  variant: 'small' | 'medium';
  btnText: string;
  isDeploying: boolean;
  isDisabled: boolean;
  onButtonClick: () => void;
  showTxApprovalModal: boolean;
  txApprovalModalObj: TxApprovalModalObjType;
  handleTxConfirm: () => void;
  showDeploySuccessModal: boolean;
  handleCloseDeploySuccessModal: () => void;
  handleViewNftClick: () => void;
}

const useDeploymentSuccess = (
  invention: Application,
  deployNFTLoader: boolean,
  deployingId: string | null,
  router: RouterType
) => {
  const inventions: InventionsType = GetProfileInventions();
  const [showDeploySuccessModal, setShowDeploySuccessModal] = useState(false);
  const [previousDeployingStatus, setPreviousDeployingStatus] = useState<
    string | undefined
  >(invention?.deployingStatus);
  const isDeploying = deployNFTLoader && deployingId === invention.id;

  useEffect(() => {
    const updatedInvention = (inventions as unknown as Application[])?.find(
      (inv) => inv?.id === invention?.id
    );

    if (
      updatedInvention &&
      previousDeployingStatus !== 'deployed' &&
      updatedInvention.deployingStatus === 'deployed' &&
      updatedInvention.nft &&
      !showDeploySuccessModal
    ) {
      setShowDeploySuccessModal(true);
    }

    if (updatedInvention?.deployingStatus) {
      setPreviousDeployingStatus(updatedInvention.deployingStatus);
    }
  }, [
    inventions,
    invention.id,
    previousDeployingStatus,
    showDeploySuccessModal
  ]);

  const handleCloseDeploySuccessModal = () => {
    setShowDeploySuccessModal(false);
  };

  const handleViewNftClick = () => {
    setShowDeploySuccessModal(false);
    const updatedInvention = (inventions as unknown as Application[])?.find(
      (inv) => inv?.id === invention?.id
    );
    if (updatedInvention?.nft) {
      router.push(`/${Constants.MARKETPLACE}/${updatedInvention.nft}`);
    }
  };

  return {
    showDeploySuccessModal,
    setShowDeploySuccessModal,
    handleCloseDeploySuccessModal,
    handleViewNftClick,
    isDeploying
  };
};

const useDeploymentHandlers = (
  invention: Application,
  user: UserType,
  dispatch: ReturnType<typeof useDispatch>,
  tokenURI: string,
  setDeployingId: React.Dispatch<React.SetStateAction<string | null>>,
  router: RouterType,
  openTxApprovalModal: OpenTxApprovalModalFn
) => {
  const handleTxConfirm = useCallback(
    () => onTxConfirm({ user, invention, tokenURI, dispatch }),
    [user, invention, tokenURI, dispatch]
  );

  const handleDeployNFT = useCallback(
    (item: Application) =>
      deployNFT({
        invention: item,
        user,
        dispatch,
        setDeployingId,
        openTxApprovalModal
      }),
    [user, dispatch, openTxApprovalModal, setDeployingId]
  );

  const onButtonClick = useCallback(() => {
    if (invention.nftTransactionUrl !== undefined && invention?.nft) {
      router.push(`/${Constants.MARKETPLACE}/${invention.nft}`);
    } else {
      handleDeployNFT(invention);
    }
  }, [invention, router, handleDeployNFT]);

  return { handleTxConfirm, handleDeployNFT, onButtonClick };
};

const DeployNftButtonContent: React.FC<DeployNftButtonContentProps> = ({
  variant,
  btnText,
  isDeploying,
  isDisabled,
  onButtonClick,
  showTxApprovalModal,
  txApprovalModalObj,
  handleTxConfirm,
  showDeploySuccessModal,
  handleCloseDeploySuccessModal,
  handleViewNftClick
}) => (
  <>
    <ActionButton
      bgColor={colorPalette.chateauGreenLight}
      fontColor={colorPalette.ChateauGreen900}
      disabled={isDisabled}
      width="100%"
      height={variant === 'small' ? '34px' : '44px'}
      sx={{ fontSize: '1.125rem' }}
      onClick={onButtonClick}
    >
      {isDeploying ? Constants.DEPLOYING : btnText}
    </ActionButton>
    {showTxApprovalModal && (
      <TxApprovalModal
        gasFee={txApprovalModalObj.gasFee}
        onConfirm={handleTxConfirm}
        open={txApprovalModalObj.open}
        type={txApprovalModalObj.type}
      />
    )}
    {showDeploySuccessModal && (
      <PopUpModal
        onClose={handleCloseDeploySuccessModal}
        open={showDeploySuccessModal}
        icon={<img src={SuccessIcon} />}
        title={Constants.YOUR_NFT_HAS_BEEN_DEPLOYED}
        subtitle={Constants.SUCCESS}
        buttonText={Constants.VIEW_NFT_TEXT}
        onButtonClick={handleViewNftClick}
      />
    )}
  </>
);

export const DeployNftButton: React.FC<DeployNftButtonProps> = ({
  invention,
  variant
}) => {
  const router = useRouter();
  const user = GetUser();
  const dispatch = useDispatch();
  const tokenURI = GetTokenURI();
  const openTransakBuyModal = GetOpenTransakBuyModalObj();
  const deployNFTLoader = GetNftDeployStartLoader();
  const txApprovalModalObj = GetTxApprovalModalObj();
  const showTxApprovalModal =
    txApprovalModalObj?.open && txApprovalModalObj?.type === ASSET_TYPES.NFT;

  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [btnText, setBtnText] = useState<string>(
    getNftDeploymentMessage(invention)
  );
  const {
    showDeploySuccessModal,
    handleCloseDeploySuccessModal,
    handleViewNftClick,
    isDeploying
  } = useDeploymentSuccess(invention, deployNFTLoader, deployingId, router);

  const openTxApprovalModal = useCallback(
    (gasFeeEstimate: number, type: string) => {
      dispatch(
        Actions.openTxApprovalModal({
          txApprovalModalObj: {
            gasFee: gasFeeEstimate,
            open: true,
            type,
            walletAddress: user?.walletAddress
          }
        })
      );
    },
    [dispatch, user?.walletAddress]
  );

  const { handleTxConfirm, onButtonClick } = useDeploymentHandlers(
    invention,
    user,
    dispatch,
    tokenURI,
    setDeployingId,
    router,
    openTxApprovalModal
  );

  useEffect(() => {
    if (openTransakBuyModal?.open) {
      openTransakBuyModalFunc(user?.walletAddress, dispatch);
    }
  }, [openTransakBuyModal?.open, user?.walletAddress, dispatch]);

  useEffect(() => {
    setBtnText(getNftDeploymentMessage(invention));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invention?.deployingStatus]);

  return (
    <DeployNftButtonContent
      variant={variant}
      btnText={btnText}
      isDeploying={isDeploying}
      isDisabled={btnText === Constants.DEPLOYING}
      onButtonClick={onButtonClick}
      showTxApprovalModal={showTxApprovalModal}
      txApprovalModalObj={txApprovalModalObj}
      handleTxConfirm={handleTxConfirm}
      showDeploySuccessModal={showDeploySuccessModal}
      handleCloseDeploySuccessModal={handleCloseDeploySuccessModal}
      handleViewNftClick={handleViewNftClick}
    />
  );
};
