import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import pusher from 'config/pusherConfig';
import { isOnPath } from 'helpers/common';
import { showToast } from 'components/common/Toast';
import Actions from 'redux-state/actions';
import { GetUser } from 'redux-state/selectors';
import { Constants, VARIANT } from 'utilities/constants';

export const useDeployNftListner = ({
  pagination,
  onDeploySuccess
}: {
  pagination?: { page?: number; perPage?: number };
  onDeploySuccess?: () => void;
}) => {
  const user = GetUser();
  const dispatch = useDispatch();
  const onDeploySuccessRef = useRef(onDeploySuccess);
  onDeploySuccessRef.current = onDeploySuccess;

  useEffect(() => {
    if (!user?.id) {
      return undefined;
    }

    const channelName = `deploy-nft-${user.id}`;
    const channel = pusher.subscribe(channelName);

    const handleDeployNftSuccess = (data) => {
      const { invention, status } = data;
      if (status?.ok) {
        showToast(`Invention deployed as NFT successfully.`, VARIANT.SUCCESS);
      } else {
        showToast(
          status?.message || `Invention deployment as NFT failed.`,
          VARIANT.ERROR
        );
      }

      dispatch(
        Actions.getProfileInventions(user?.id, pagination, null, false, true)
      );

      const inventionKey = invention?.id ?? invention?._id ?? invention?.key;
      if (isOnPath(Constants.INVENTION) && inventionKey) {
        dispatch(Actions.fetchInventionByKey(inventionKey));
      }

      onDeploySuccessRef.current?.();
    };

    channel.bind('deploy-nft', handleDeployNftSuccess);

    return () => {
      channel.unbind('deploy-nft', handleDeployNftSuccess);
      // Do not unsubscribe — other listeners may share this channel
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, user?.id, pagination]);
};
