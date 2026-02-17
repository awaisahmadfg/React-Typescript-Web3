/* eslint-disable */
import Config from 'config/config';
import { CustomError } from 'helpers/CustomError';
import { getToken, removeToken } from 'helpers/common';
import { toastify } from 'pages/newContests/toastify';
import queryString from 'query-string';
import auth, { AuthProvider } from './authProvider';
import { FetchUtils } from './fetchUtils';
import { Item as TreeItem, flatList } from './helpers';
import { CreditsHistory } from './interface/common';
import { GlobalSearchResponse } from './redux-state/commons/interface';
import {
  Constants,
  END_POINTS,
  ERRORS,
  PATH_NAMES,
  RESOURCE,
  TOASTIFY_DURATION,
  VARIANT
} from './utilities/constants';
import { companyTagData } from './modals/CompanySubscription/CompanySubscription';
import { BigNumber } from 'ethers';

export type PsOptionType = {
  label: string;
  value: string;
};

export type PayOption = {
  id: string | number;
  type: string;
  sortIndex: number;
  title: string;
  subTitle?: string;
  price: string;
  priceInfo?: string;
  documentTitle: string;
  documentTemplate: string;
  subProducts: Array<PayOption>;
};

export type PayProduct = {
  productId: string | number;
  status: string;
  payStatus: string;
  templateId: string;
  templateId2: string;
  title: string;
};

export type SubscriptionOption = {
  id: string | number;
  type: string;
  price: string;
};

export type ActivitySeen = {
  activityId: string | number;
  seen: boolean;
};

export type CreditsPrice = {
  id: string;
  count: number;
  price: number;
  priceStr: string;
};

let API_URL = Config.NEXT_PUBLIC_API_URL;
if (typeof window === 'undefined') {
  // SSR
  API_URL = Config.NEXT_PUBLIC_API_URL_IN;
}

export type Identifier = string | number;

export interface PsRecord {
  id: Identifier;
  [key: string]: any;
}

export interface SortPayload {
  field: string;
  order: string | number;
}
export interface FilterPayload {
  [k: string]: any;
}
export interface PaginationPayload {
  page: number | string;
  perPage: number | string;
}

export interface GetListParams {
  filter?: any;
  itemType?: string;
  pagination?: PaginationPayload;
  sort?: SortPayload;
  search?: string | null;
}

export interface GetListResult<RecordType = PsRecord> {
  data: RecordType[];
  pinnedItems?: RecordType[];
  total: number;
  updatePinItems?: boolean;
  totalActivities?: number;
}

export interface Request {
  type: string;
  status: string;
}

export interface RequestItemId {
  id: Identifier;
  ref: string;
}

export interface Request {
  _id?: Identifier;
  type: string;
  status: string;
  itemId: RequestItemId;
  userId: Identifier;
  data?: Record<string, any>;
}

export interface LinkStripeAccount {
  success: boolean;
  stripeOnboardingUrl?: string;
  message?: string;
}

export interface StripeAccountStatus {
  isActive: boolean;
}

export interface StripeOnboarding {
  stripeOnboardingUrl: string;
}

export interface GetUserRankResult {
  rank: number;
}

export interface GetUserIdeaPointsResult {
  ideaPoints: number;
}

export interface GetProfileItemsCount {
  count?: number;
}

export interface GetManyParams {
  ids: Identifier[];
}
export interface GetManyResult<RecordType = PsRecord> {
  data: RecordType[];
  total: number;
}

export interface GetOneParams {
  id: Identifier;
}

export interface GetOneFilterParams {
  key: any;
  value: any;
}
export interface GetOneByKeyParams {
  key: string;
  pagination?: {
    page: number;
    perPage: number;
  };
  [key: string]: any;
}
export interface GetOneResult<RecordType = PsRecord> {
  data: RecordType;
}

export interface getRelatedItemsParams {
  key: string;
  item: string;
  pagination: {
    page: number;
    perPage: number;
  };
  [key: string]: any;
}

export interface CreateParams<T = any> {
  data: T;
}
export interface CreateResult<RecordType = PsRecord> {
  data: RecordType;
}

export interface UpdateParams<T = any> {
  id?: Identifier;
  data: T;
}

export interface FollowTag {
  tagId: string | number;
  followers: string | number;
  actionType: string;
}

export interface UpdateResult<RecordType = PsRecord> {
  data: RecordType;
}

export interface DeleteSocialAuthKeyParams {
  id: string | number;
}
export interface DeleteParams<T = any> {
  id: Identifier;
}
export interface DeleteResult<RecordType = PsRecord> {
  data: RecordType;
}

const prepareQueryString = (
  params: Partial<GetListParams>
): Record<string, string> => {
  const { page = 0, perPage = 10 } = params.pagination || {};
  const { field = 'createdAt', order = 'ASC' } = params.sort || {};
  let rangeStart, rangeEnd;
  if (
    params?.filter?.$custom?.category == 'profile' ||
    params?.filter?.$custom?.category == 'tag' ||
    params?.filter?.$custom?.category == 'public' ||
    params?.filter?.$custom?.category == 'tagUser' ||
    params?.filter?.$custom?.category == Constants.REWARD ||
    params?.filter?.$custom?.category == Constants.NOTIFICATION
  ) {
    rangeStart = (page as number) * (perPage as number);
    rangeEnd = ((page as number) + 1) * (perPage as number) - 1;
  } else {
    rangeStart = (page as number) * (perPage as number);
    rangeEnd = ((page as number) + 1) * (perPage as number) - 1;
  }
  const query = {
    sort: JSON.stringify([field, order]),
    range: JSON.stringify([rangeStart, rangeEnd]),
    filter: JSON.stringify(params.filter),
    search: JSON.stringify(params?.search)
  };
  return query;
};

const createParamString = (params) => {
  const query = {};
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value != undefined) {
      query[key] = JSON.stringify(value);
    }
  }
  return queryString.stringify(query);
};

interface DataProviderI {
  getList: <RecordType extends PsRecord = PsRecord>(
    resource: string,
    params: GetListParams
  ) => Promise<GetListResult<RecordType>>;
  getMany: <RecordType extends PsRecord = PsRecord>(
    resource: string,
    params: GetManyParams
  ) => Promise<GetManyResult<RecordType>>;
  getOne: <RecordType extends PsRecord = PsRecord>(
    resource: string,
    params: GetOneParams
  ) => Promise<GetOneResult<RecordType>>;
  create: <RecordType extends PsRecord = PsRecord>(
    resource: string,
    params: CreateParams
  ) => Promise<CreateResult<RecordType>>;
  update: <RecordType extends PsRecord = PsRecord>(
    resource: string,
    params: UpdateParams
  ) => Promise<UpdateResult<RecordType>>;
  getTagContributors: <RecordType extends PsRecord = PsRecord>(
    params: GetOneParams
  ) => Promise<GetListResult<RecordType>>;
  getProfileStats: <RecordType extends PsRecord = PsRecord>(
    params: GetOneParams
  ) => Promise<GetOneResult<RecordType>>;
  getSolutions: <RecordType extends PsRecord = PsRecord>(
    key: string
  ) => Promise<GetListResult<RecordType>>;
}

export class DataProvider implements DataProviderI {
  auth: AuthProvider;

  private userId = '';

  private serverJwtToken: string | undefined;

  constructor({ auth }: { auth: AuthProvider }) {
    this.auth = auth;
    // Disabled socket for testing purposes
    // this.socket = io(Config.NEXT_PUBLIC_WS_URL as string, {
    //   withCredentials: true
    // });

    // this.socket.on('connection', () => {
    //   this.socket.emit('listen', this.userId);
    // });
  }

  private getResourceName(part: string): string {
    return part;
  }

  private async makeRequest(
    request: {
      url: string;
      options?: RequestInit;
      throwError?: boolean;
      suppressToast?: boolean;
    },
    isFormData?: boolean
  ): Promise<any> {
    const jwtToken = getToken();
    const headers = new Headers();
    if (!isFormData) {
      headers.set('Content-Type', 'application/json');
    }
    if (jwtToken) {
      headers.set('Authorization', `Bearer ${jwtToken}`);
    }
    try {
      const res = await FetchUtils.fetchJson(request.url, {
        ...request.options,
        credentials: 'include',
        mode: 'cors',
        headers
      });
      return res;
    } catch (error) {
      const newError = new CustomError(
        error.error || error.message,
        error.status
      );

      const errorMsg =
        error.status == 500
          ? ERRORS.UNEXPECTED_ERROR
          : error.status == 401
            ? ERRORS.UNAUTHORIZED_PLEASE_LOGIN
            : error.message;

      const isUnauthorized = error.status == 401;
      if (isUnauthorized) {
        removeToken();
      }
      if (isUnauthorized || request.throwError) {
        if (!request.suppressToast) {
          toastify(
            errorMsg,
            VARIANT.ERROR,
            VARIANT.TOP_LEFT,
            TOASTIFY_DURATION
          );
        }
        throw newError;
      }
    }
  }

  onSocket(eventName: string, cb: (data?: any) => void) {
    // Disabled socket for testing purposes
    return;
  }

  offSocket(eventName: string, cb: (data?: any) => void) {
    // Disabled socket for testing purposes
    return;
  }

  listenUser(userId: string): void {
    // Disabled socket for testing purposes
    return;
    this.userId = userId;
  }

  async configureSSR() {
    try {
      const token = getToken();
      this.serverJwtToken = token || '';
    } catch (err) {
      console.error(err);
    }
  }

  async getList<T>(
    resource: string,
    params: GetListParams
  ): Promise<GetListResult<T>> {
    const resourceName = this.getResourceName(resource);
    const query = prepareQueryString(params);
    const request = {
      url: `${API_URL}/${resourceName}?${queryString.stringify(query)}`
    };
    const data = await this.makeRequest(request);
    return {
      data: data.data,
      total: data?.total,
      totalActivities: data?.totalActivities,
      pinnedItems: data?.pinnedItems ?? [],
      updatePinItems: data?.updatePinItems ?? false
    };
  }

  // async inviteNewUser(payload: any) {
  //   try {
  //     const { nftInvitation, inventionId, inventionName, ...rest } = payload;
  //     const jwtToken = await this.auth.getJwtToken();
  //     const response = await fetch(
  //       `${API_URL}/auth${PATH_NAMES.ADMIN_INVITE}`,
  //       {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           Authorization: `Bearer ${jwtToken}`
  //         },
  //         body: JSON.stringify({ payload: rest })
  //       }
  //     );
  //     return { response };
  //   } catch (error) {
  //     console.error(ERRORS.INVITE_USER_ERROR, error);
  //     throw new Error(ERRORS.ERROR_SENDING_INVITE);
  //   }
  // }

  async inviteInfluencers<T>(payload: any) {
    const request = {
      url: `${API_URL}/influencers/invite`,
      options: {
        body: JSON.stringify(payload),
        method: 'POST'
      },
      throwError: true
    };

    const data = await this.makeRequest(request);
    return data;
  }

  async inviteLeader<T>(payload: any): Promise<T> {
    const request = {
      url: `${API_URL}/tags/inviteLeader`,
      options: {
        body: JSON.stringify(payload),
        method: 'POST'
      },
      throwError: true
    };

    const data = await this.makeRequest(request);
    return data;
  }

  async getMetricsForCommunityLeader(communityKey: string): Promise<{
    activeConcepts: number;
    solutionsThisWeek: number;
    unclaimedPatents: number;
    followers: any;
  }> {
    const request = {
      url: `${API_URL}/tags/communityLeaderMetrics/${communityKey}`
    };

    const data = await this.makeRequest(request);
    return data;
  }

  async checkImprovedProgress(conceptId): Promise<any> {
    const request = {
      url: `${API_URL}/${RESOURCE.APPLICATIONS}/${Constants.CHECKED_IMOROVED_PROGRESS}/${conceptId}`
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async updateCtaModal(payload): Promise<any> {
    const request = {
      url: `${API_URL}/profiles/updateCtaModalDisplay`,
      options: { method: 'POST', body: JSON.stringify(payload) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getSolutions<T>(key: string): Promise<GetListResult<T>> {
    const request = {
      url: `${API_URL}/${Constants.SOLUTIONS_BY_IDS}?key=${key}`
    };

    const data = await this.makeRequest(request);
    return {
      data: data || [],
      total: data?.length
    };
  }

  async checkContestProblem(id: string | number) {
    const request = {
      url: `${API_URL}/${RESOURCE.CONTESTS}${END_POINTS.CHECK_CONTEST_PROBLEM}/${id}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async checkConceptSolution(id: string | number) {
    const request = {
      url: `${API_URL}/${RESOURCE.CONTESTS}${END_POINTS.CHECK_CONCEPT_SOLUTION}/${id}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getDocumentIndex<T>(
    resource: string,
    params: {
      filter: object;
      sort: object;
      id: string;
    }
  ) {
    const paramString = createParamString(params);
    const request = {
      url: `${API_URL}/${resource}${END_POINTS.GET_DOC_INDEX}/?${paramString}`
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getOne<T>(resource: string, params: GetOneParams) {
    const resourceName = this.getResourceName(resource);
    const request = { url: `${API_URL}/${resourceName}/getOne/${params.id}` };
    const data = await this.makeRequest(request);
    return { data };
  }

  async getOneByFilter<T>(resource: string, params: GetOneFilterParams) {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/getOneByFilter?key=${params.key}&value=${params.value}`
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async createCampaign<T>(
    resource: string,
    itemId: object,
    influencerId: string | number
  ) {
    const request = {
      url: `${API_URL}/${resource}`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          itemId,
          influencerId
        })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getOneCampaign<T>(
    resource: string,
    itemId: string | number,
    influencerId: string | number
  ) {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/getOneCampaign?itemId=${itemId}&influencerId=${influencerId}`
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getOneByKey<T>(
    resource: string,
    params: GetOneByKeyParams
  ): Promise<GetOneResult<T>> {
    const resourceName = this.getResourceName(resource);
    const query = prepareQueryString(params);
    const request = {
      url: `${API_URL}/${resourceName}/b_k/${
        params.key
      }?${queryString.stringify(query)}`
    };

    const data = await this.makeRequest(request);
    return { data };
  }

  async getOneByEmail<T>(resource: string, email: string) {
    const request = {
      url: `${API_URL}/${resource}/getOneByEmail/${email}`
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getProfileByEmail<T>(email: string) {
    const request = {
      url: `${API_URL}/${RESOURCE.PROFILES}/getOneByEmail/${email}`
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getMyPrivateKey(): Promise<{ privateKey: string | null }> {
    const request = {
      url: `${API_URL}/${RESOURCE.PROFILES}/me/private-key`
    };
    try {
      const data = await this.makeRequest(request);
      return { privateKey: data?.privateKey ?? null };
    } catch {
      return { privateKey: null };
    }
  }

  async getOneByProductTitle<T>(
    resource: string,
    params: { title: string }
  ): Promise<GetOneResult<T>> {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/getonebytitle?title=${params.title}`
    };

    const data = await this.makeRequest(request);
    return { data };
  }

  async fuzzySearch<T>(
    resource: string,
    params: { searchText: string; filter?: any }
  ) {
    const searchText = params.searchText;
    let requestUrl = `${API_URL}/${resource}${END_POINTS.FUZZY_SEARCH}/?searchText=${searchText}`;
    if (params.filter) {
      const filter = JSON.stringify(params.filter);
      requestUrl += `&filter=${filter}`;
    }
    const request = {
      url: requestUrl
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getMany<T>(
    resource: string,
    params: object
  ): Promise<GetManyResult<T>> {
    const resourceName = this.getResourceName(resource);
    const paramString = createParamString(params);
    const request = {
      url: `${API_URL}/${resourceName}?${paramString}`
    };
    const res = await this.makeRequest(request);
    return {
      data: res.data,
      total: res.total
    };
  }

  async getByIds(resource: any, params: GetManyParams) {
    const resourceName = this.getResourceName(resource);
    const query = {
      filter: JSON.stringify({ ids: params.ids })
    };
    const request = {
      url: `${API_URL}/${resourceName}${END_POINTS.GET_MANY}/?${queryString.stringify(query)}`
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async fetchInventionComponent(data: {
    conceptId: string;
    solutionId: string;
  }): Promise<any> {
    const request = {
      url: `${API_URL}${END_POINTS.FETCH_INVENTION_COMPONENT}`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return { data: res };
  }

  async getAllInfluencers(): Promise<any> {
    const request = {
      url: `${API_URL}/dashboard/getInfluencers`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return { data: res };
  }

  async createComponent(data): Promise<any> {
    const request = {
      url: `${API_URL}/${RESOURCE.COMPONENTS}${END_POINTS.CREATE_COMPONENT}`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getAllComponentsOfConcept(data): Promise<any> {
    const request = {
      url: `${API_URL}${END_POINTS.GET_COMPONENTS_FROM_CONCEPT_ID}`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return { data: res };
  }

  async getRelatedItems(resource: string, params: getRelatedItemsParams) {
    const resourceName = this.getResourceName(resource);
    const query = prepareQueryString(params);
    const request = {
      url: `${API_URL}/${resourceName}/${params.key}/relatedItem/${
        params.item
      }?${queryString.stringify(query)}`
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async deleteSocialAuthKey<T>(
    resource: string,
    params: DeleteSocialAuthKeyParams,
    throwError?: boolean
  ): Promise<DeleteResult<T>> {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/${params.id}`,
      options: { method: 'DELETE' },
      throwError
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async processVideoExample(resource: string, id, type, audioBlob) {
    const resourceName = this.getResourceName(resource);

    const formData = new FormData();
    formData.append('id', id);
    formData.append('itemType', type);
    {
      audioBlob && formData.append('audioBlob', audioBlob, 'audio.wav');
    }

    const request = {
      url: `${API_URL}/${resourceName}/getVideo`,
      options: {
        method: 'POST',
        body: formData
      },
      throwError: true
    };

    const res = await this.makeRequest(request, true);
    return res;
  }

  async processPromoVideoExample(resource: string, id, type, audioBlob, data) {
    const resourceName = this.getResourceName(resource);

    const formData = new FormData();
    formData.append('id', id);
    formData.append('itemType', type);
    formData.append('data', JSON.stringify(data));
    {
      audioBlob && formData.append('audioBlob', audioBlob, 'audio.wav');
    }

    const request = {
      url: `${API_URL}/${resourceName}/getPromoVideo`,
      options: {
        method: 'POST',
        body: formData
      },
      throwError: true
    };

    const res = await this.makeRequest(request, true);
    return res;
  }

  async shareVideoToYoutubechannel(data: any) {
    const request = {
      url: `${API_URL}/share/shareVideoToYoutubechannel`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getOwnedCommunity(userId) {
    const request = {
      url: `${API_URL}/${RESOURCE.TAGS}${END_POINTS.GET_USER_OWNED_COMMUNITY}/${userId}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getFollowersRange() {
    const request = {
      url: `${API_URL}/${RESOURCE.TAGS}/getfollowersrange`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getIdeapointsRange() {
    const request = {
      url: `${API_URL}/${RESOURCE.TAGS}/getideapointsrange`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getFollowingTagsCount(userKey, onlyCount, pagination) {
    let url = `${API_URL}/${Constants.TAGS}/${Constants.GET_FOLLOWING_TAGS}?onlyCount=${onlyCount}&userKey=${userKey}&page=${pagination?.page}&perPage=${pagination?.perPage}`;
    const request = {
      url: url,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getMutualTags(userRank, pagination = null, key = null, filter) {
    let url = `${API_URL}/${Constants.TAGS}/${Constants.GET_MUTUAL_TAGS}?userRank=${userRank}`;

    if (pagination) {
      url += `&page=${pagination.page}&perPage=${pagination.rowsPerPage}`;
    }
    if (key) {
      url += `&key=${key}`;
    }
    if (filter) {
      url += `&filter=${filter}`;
    }
    const request = {
      url: url,
      options: { method: 'GET' }
    };

    const res = await this.makeRequest(request);
    return res;
  }

  async distributeReward<T>() {
    const request = {
      url: `${API_URL}${PATH_NAMES.REWARDS}${END_POINTS.DISTRIBUTE_ETH_REWARD}`,
      options: { method: 'PUT' }
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async getRewardPoolThreshold<T>() {
    const request = {
      url: `${API_URL}${PATH_NAMES.REWARDS}${END_POINTS.GET_REWARD_POOL_THRESHOLD}`,
      options: { method: 'GET' }
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async nftApproval<T>(tokenId: string, walletAddress: string) {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.APPROVE_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({ tokenId, walletAddress })
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async listFixedNft(
    tokenId: string,
    listPrice: BigNumber,
    usdPrice: number,
    walletAddress: string
  ) {
    const request = {
      url: `${API_URL}/${PATH_NAMES.MARKETPLACE}${END_POINTS.LIST_FIXED_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({ tokenId, listPrice, usdPrice, walletAddress })
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async cancelFixedNft(tokenId: string, priceOfNft: object) {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.CANCEL_FIXED_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({ tokenId, priceOfNft })
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async buyFixedNft(
    tokenId: string,
    priceOfNft: object,
    walletAddress: string
  ) {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.BUY_FIXED_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({ tokenId, priceOfNft, walletAddress })
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async listAuctionNft(
    listPrice: BigNumber,
    auctionStartTime: BigNumber,
    auctionEndTime: BigNumber,
    tokenId: string,
    usdPrice: number,
    walletAddress: string
  ) {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.LIST_AUCTION_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          listPrice: listPrice.toString(),
          auctionStartTime: auctionStartTime.toString(),
          auctionEndTime: auctionEndTime.toString(),
          tokenId,
          usdPrice,
          walletAddress
        })
      },
      throwError: true,
      suppressToast: true
    };

    const data = await this.makeRequest(request);
    return { data };
  }

  async cancelAuctionNft(tokenId: string, priceOfNft: object) {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.CANCEL_AUCTION_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({ tokenId, priceOfNft })
      },
      throwError: true
    };

    const data = await this.makeRequest(request);
    return { data };
  }

  async bidOnNft(
    auctionId: string,
    bidAmount: string,
    usdPrice: number,
    walletAddress: string
  ) {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.BID_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({ auctionId, bidAmount, usdPrice, walletAddress })
      },
      throwError: true,
      suppressToast: true // Suppress toast in makeRequest, saga will show the proper error message
    };

    const data = await this.makeRequest(request);
    return { data };
  }

  async acceptOffer(
    auctionId: string,
    bidOwnerId: string,
    walletAddress: string
  ) {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.ACCEPT_OFFER}`,
      options: {
        method: 'POST',
        body: JSON.stringify({ auctionId, bidOwnerId, walletAddress })
      },
      throwError: true
    };

    const data = await this.makeRequest(request);
    return { data };
  }

  async claimNft(auctionId: string, walletAddress: string) {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.CLAIM_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({ auctionId, walletAddress })
      },
      throwError: true
    };

    const data = await this.makeRequest(request);
    return { data };
  }

  async create<T>(
    resource: string,
    params: CreateParams,
    options?: { suppressToast?: boolean }
  ): Promise<CreateResult<T>> {
    const resourceName = this.getResourceName(resource);
    const isFormData = params.data instanceof FormData;

    if (!isFormData) {
      this._prepareCreateParams(params);
    }

    const request = {
      url: `${API_URL}/${resourceName}`,
      options: {
        body: isFormData ? params?.data : JSON.stringify(params.data),
        method: 'POST'
      },
      throwError: true,
      suppressToast: options?.suppressToast
    };

    const data = await this.makeRequest(request, isFormData);
    return { data };
  }

  async update<T>(
    resource: string,
    params: UpdateParams
  ): Promise<UpdateResult<T>> {
    const resourceName = this.getResourceName(resource);
    // Remove this in future.
    // this._prepareUpdateParams(params);
    const request = {
      url: `${API_URL}/${resourceName}/${params.id}`,
      options: { method: 'PUT', body: JSON.stringify(params.data) }
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async pin<T>(
    resource: string,
    id: string,
    isPinned: boolean,
    isFiled?: boolean
  ): Promise<UpdateResult<T>> {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/pin/${id}`,
      options: {
        method: 'PUT',
        body: JSON.stringify({ isPinned: isPinned, isFiled: isFiled })
      }
    };

    const data = await this.makeRequest(request);
    return { data };
  }

  async delete<T>(
    resource: string,
    params: DeleteParams,
    throwError?: boolean
  ): Promise<DeleteResult<T>> {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/${params.id}`,
      options: { method: 'DELETE' },
      throwError
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async fileApplication(id: string | number, formData: any): Promise<any> {
    const request = {
      url: `${API_URL}/${Constants.APPLICATIONS}/${id}/file`,
      options: {
        body: formData,
        method: 'POST'
      },
      throwError: true
    };
    const res = await this.makeRequest(request, true);
    return { data: res };
  }

  async forgetPassword(data: {
    email: string;
  }): Promise<{ data: { message: string } }> {
    const request = {
      url: `${API_URL}/${RESOURCE.AUTH}${END_POINTS.FORGET_PASSWORD}`,
      options: { method: 'POST', body: JSON.stringify(data) },
      throwError: true,
      suppressToast: true
    };
    const res = await this.makeRequest(request);
    return { data: res };
  }

  async resetPassword(data: {
    newPassword: string;
    resetToken: string;
  }): Promise<{ data: { message: string } }> {
    const request = {
      url: `${API_URL}/${RESOURCE.PROFILES}${END_POINTS.RESET_PASSWORD}`,
      options: { method: 'POST', body: JSON.stringify(data) },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return { data: res };
  }

  async findTagSubscriptionRequest(tagId, type): Promise<Request> {
    const request = {
      url: `${API_URL}/${RESOURCE.REQUESTS}/${Constants.FIND_ONE}`,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tagId, type })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getNFTInfo<T>(info: {
    tokens?: Array<string | number>;
    page?: number;
    perPage?: number;
  }): Promise<{ data: Array<T> }> {
    const query = {
      page: info.page,
      perPage: info.perPage,
      tokens: info.tokens ? JSON.stringify(info.tokens) : undefined
    };
    const request = {
      url: `${API_URL}/applications/nftInfo?${queryString.stringify(query)}`,
      options: { method: 'GET' }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getSolutionProblem<T>(param: GetOneParams): Promise<GetOneResult<T>> {
    const request = { url: `${API_URL}/solutions/${param.id}/problem` };
    const data = await this.makeRequest(request);
    return { data };
  }

  async getObjectsBySubstring<T>(
    resource: string,
    substring: string
  ): Promise<GetListResult<T>> {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/search?substring=${substring}`
    };
    const data = await this.makeRequest(request);
    return {
      data: data.data,
      total: data.total
    };
  }

  async getLimitedObjectsBySubstring<T>(
    resource: string,
    substring: string
  ): Promise<GetListResult<T>> {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/global-search?substring=${substring}`
    };
    const { data, total } = await this.makeRequest(request);
    return {
      data,
      total
    };
  }

  async getProblemTree(param: GetOneParams): Promise<Array<TreeItem>> {
    const request = { url: `${API_URL}/problems/${param.id}/tree` };
    const data = await this.makeRequest(request);
    const [problemId, ...list] = flatList(data);
    return list;
  }

  async getTagContributors<T>(param: GetOneParams): Promise<GetListResult<T>> {
    const request = { url: `${API_URL}/tags/${param.id}/contributors` };
    const data = await this.makeRequest(request);

    return {
      data: data,
      total: 0
    };
  }

  async getTagFollowers<T>(param: GetOneParams): Promise<GetListResult<T>> {
    const request = {
      url: `${API_URL}/activities/followers/${param.id}`
    };
    const data = await this.makeRequest(request);
    return {
      data: data,
      total: 0
    };
  }

  async getContestActivities<T>(
    contestId: string | number,
    limit?: number
  ): Promise<GetListResult<T>> {
    const limitParam = limit ? `?limit=${limit}` : '';
    const request = {
      url: `${API_URL}/activities/contest/${contestId}${limitParam}`
    };
    const data = await this.makeRequest(request);
    return {
      data: data.data || [],
      total: data.total || 0
    };
  }

  async fetchScrappedProfiles(payload: any) {
    try {
      const { companyIds, type = Constants.LINKEDIN } = payload;
      if (!Array.isArray(companyIds) || companyIds.length === 0) {
        throw new Error(ERRORS.INVALID_INPUT);
      }
      const companyIdsParam = companyIds.join(',');
      const request = {
        url:
          type === Constants.LINKEDIN
            ? `${API_URL}/influencers/fetchLinkedInScrappedInfluencersInfo?mindMinerCompanyIds=${companyIdsParam}&type=${type}`
            : `${API_URL}/influencers/fetchYouTubeScrappedInfluencersInfo?mindMinerCompanyIds=${companyIdsParam}&type=${type}`,
        options: { method: 'GET' },
        throwError: true
      };

      const result = await this.makeRequest(request);

      if (!result?.data || !Array.isArray(result.data)) {
        throw new Error(ERRORS.FETCHING_CONTACTS_FROM_DB);
      }

      const mappedData = result.data.map((item: any) => ({
        contactId: item._id || item.id,
        mindMinerCompanyId: item.mindMinerCompanyId
      }));

      const newRequest = {
        url: `${API_URL}/scrapperCreditHistory/bulk?type=${type}`,
        options: {
          method: 'POST',
          body: JSON.stringify(mappedData)
        }
      };

      await this.makeRequest(newRequest);
      return result;
    } catch (error) {
      console.log(ERRORS.FETCHING_CONTACTS_FROM_DB, error);
      throw error;
    }
  }

  async scrapLinkedinProfiles(payload: any) {
    try {
      const { companyIds, companyNames, locations, searchTerms } = payload;
      if (!companyIds || !companyNames || !locations || !searchTerms) {
        return;
      }
      const request = {
        url: Config.NEXT_PUBLIC_LINKEDIN_SCRAPPER,
        options: {
          method: 'POST',
          body: JSON.stringify({
            company_ids: companyIds,
            company_names: companyNames,
            locations,
            search_terms: searchTerms
          })
        }
      };
      const result = await this.makeRequest(request);
      const save = {
        url: `${API_URL}/influencers/updateInfluencersInfo`,
        options: {
          method: 'POST',
          body: JSON.stringify(result)
        }
      };
      const savedData = await this.makeRequest(save);
      const finalResult = await this.fetchScrappedProfiles({
        companyIds,
        type: 'linkedin'
      });
      return finalResult;
    } catch (error) {
      console.log(ERRORS.LINKEDIN_SCRAPPING_ERROR, error);
    }
  }

  async scrapYouTubeProfiles(payload: {
    query: string;
    mindMinerCompanyId: string;
    maxResults?: number;
  }) {
    try {
      const { query, mindMinerCompanyId, maxResults = 10 } = payload;
      if (!query || !mindMinerCompanyId) {
        console.error(ERRORS.INVALID_PARAMETERS);
        return;
      }
      const request = {
        url: `${API_URL}/influencers/youtubeScrapper?query=${encodeURIComponent(query)}&mindMinerCompanyId=${mindMinerCompanyId}&maxResults=${maxResults}`,
        options: {
          method: 'GET'
        },
        throwError: true
      };
      const result = await this.makeRequest(request);
      const save = {
        url: `${API_URL}/influencers/updateInfluencersInfo`,
        options: {
          method: 'POST',
          body: JSON.stringify(result)
        }
      };
      const savedData = await this.makeRequest(save);
      const finalResult = await this.fetchScrappedProfiles({
        companyIds: [mindMinerCompanyId],
        type: 'youtube'
      });
      return finalResult;
    } catch (error) {
      console.error(ERRORS.YOUTUBE_SCRAPPING_ERROR, error);
    }
  }

  async fetchActiveCampaigns(payload: any) {
    try {
      const query = {
        filter: JSON.stringify(payload.filter)
      };
      const request = {
        url: `${API_URL}/inventionOpportunity?${queryString.stringify(query)}`,
        options: { method: 'GET' }
      };
      const result = await this.makeRequest(request);
      return result;
    } catch (error) {
      console.log(ERRORS.ACTIVE_CAMPAIGN_FETCHING_ERROR, error);
    }
  }

  async followTag<T>(
    resource: string,
    params: FollowTag
  ): Promise<GetListResult<T>> {
    const request = {
      url: `${API_URL}/${resource}/follow/${
        params.tagId
      }?${queryString.stringify(params)}`,
      options: { method: 'PUT' }
    };
    const data = await this.makeRequest(request);
    return {
      data: data,
      total: 0
    };
  }

  async getTagTopUsers<T>(
    groupId: string | number
  ): Promise<{ data: Array<T> }> {
    const request = {
      url: `${API_URL}/rewards/top/users?groupId=${groupId}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getProfileStats<T>(
    param: GetOneParams,
    type?: string
  ): Promise<GetOneResult<T>> {
    const request = {
      url: `${API_URL}/profiles/${param.id}/stats?type=${type}`
    };
    const data = await this.makeRequest(request);

    return { data };
  }

  async getManufacturers<T>(params): Promise<GetListResult> {
    const paramString = createParamString(params);
    const request = {
      url: `${API_URL}/manufacturerCompany?${paramString}`
    };
    const data = await this.makeRequest(request);
    return { data: data, total: data?.length };
  }

  async getManufacturersWithQuotation<T>(params) {
    const paramString = createParamString(params);
    const request = {
      url: `${API_URL}/manufacturerCompany/getManufacturersWithQuotation?${paramString}`
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getBidOffers<T>(tokenId: string | number): Promise<GetListResult> {
    const request = {
      url: `${API_URL}${PATH_NAMES.MARKETPLACE}${END_POINTS.BID_NFT}/${tokenId}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async deleteBidOffer<T>(
    resource: string,
    payload: { tokenId: string | number }
  ) {
    const request = {
      url: `${API_URL}/${resource}?tokenId=${payload.tokenId}`,
      options: { method: 'DELETE' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getCompanyInformation<T>(id: string | Array<string>): Promise<any> {
    const request = {
      url: `${API_URL}/manufacturerCompany/getOneByRepresentative/${id}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async sendInvitationEmail<T>(email: string, companyName: string): Promise<T> {
    const request = {
      url: `${API_URL}/sendInvitationEmail`,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, companyName })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async updateQuotationRequest<T>(id, payload): Promise<T> {
    const request = {
      url: `${API_URL}/quotationRequests/updateInvention/${id}`,
      options: { method: 'PUT', body: JSON.stringify(payload) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async linkStripeAccount<T>(id, payload): Promise<LinkStripeAccount> {
    const request = {
      url: `${API_URL}/manufacturerCompany/linkStripeAccount/${id}`,
      options: { method: 'PUT', body: JSON.stringify(payload) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async fetchStripeAccountStatus<T>(accountId): Promise<StripeAccountStatus> {
    const request = {
      url: `${API_URL}/manufacturerCompany/fetchStripeAccountStatus/${accountId}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async retryStripeOnboarding<T>(
    accountId,
    redirectUrl
  ): Promise<StripeOnboarding> {
    const request = {
      url: `${API_URL}/manufacturerCompany/retryStripeOnboarding`,
      options: {
        method: 'POST',
        body: JSON.stringify({ accountId, redirectUrl })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getProfileFollowers<T>(param: GetOneParams): Promise<GetOneResult<T>> {
    const request = { url: `${API_URL}/profiles/${param.id}/followers` };
    const data = await this.makeRequest(request);

    return { data };
  }

  async getProfileContests<T>(param: GetOneParams): Promise<GetOneResult<T>> {
    const request = { url: `${API_URL}/profiles/${param.id}/contests` };
    const data = await this.makeRequest(request);

    return { data };
  }

  async getContestsByProblemOrSolution<T>(
    id: string,
    type: string
  ): Promise<GetListResult<T>> {
    const request = {
      url: `${API_URL}/contests/byProblemOrSolution/${id}/${type}`
    };
    const data = await this.makeRequest(request);

    return data;
  }

  async getGraph<T>(
    resource: string,
    id: string | number,
    mapType: string
  ): Promise<T> {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/${id}/graph?mapType=${mapType}`
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async generateProblems(resource: string, id: string | number) {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/${id}/generateProblems`,
      options: {
        method: 'POST'
      }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async generateMore(resource: string, params) {
    const request = {
      url: `${API_URL}/${resource}/generateMore`,
      options: {
        method: 'POST',
        body: JSON.stringify(params)
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async generateProblemsFromProductTypes(params) {
    const request = {
      url: `${API_URL}/company-products/${params['productId']}/generateProblemsFromProductTypes`,
      options: { method: 'POST', body: JSON.stringify(params) },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async generateSolutionsFromProductTypes(params) {
    const request = {
      url: `${API_URL}/company-products/${params['productId']}/generateSolutionsFromProductTypes`,
      options: { method: 'POST', body: JSON.stringify(params) }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async generateProblemsForApplication(params) {
    const request = {
      url: `${API_URL}/applications/${params['productId']}/generateProblemsForApplication`,
      options: { method: 'POST', body: JSON.stringify(params) },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async generateSolutionsForApplication(params) {
    const request = {
      url: `${API_URL}/applications/${params['productId']}/generateSolutionsForApplication`,
      options: { method: 'POST', body: JSON.stringify(params) }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async assignProblem(params: any) {
    const request = {
      url: `${API_URL}/company-products/${params['id']}/assignProblem`,
      options: { method: 'POST', body: JSON.stringify(params) }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async assignSolution(params: any) {
    const request = {
      url: `${API_URL}/problems/${params['id']}/assignSolution`,
      options: { method: 'POST', body: JSON.stringify(params) }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async generateSolutions(resource: string, id: string | number) {
    const resourceName = this.getResourceName(resource);
    const request = {
      url: `${API_URL}/${resourceName}/${id}/generateSolutions`,
      options: {
        method: 'POST'
      }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getJackpots<T>(resource: string, id: string | number): Promise<T> {
    const resourceName = this.getResourceName(resource);
    const request = { url: `${API_URL}/${resourceName}/${id}/jackpots` };
    const data = await this.makeRequest(request);
    return data;
  }

  async getLocationList(query = ''): Promise<Array<PsOptionType>> {
    const request = {
      url: `${API_URL}/profiles/location?type=location&query=${encodeURIComponent(
        query
      )}`
    };
    const list = await this.makeRequest(request);
    return list;
  }

  async getWorkplaceList(query = ''): Promise<Array<PsOptionType>> {
    const request = {
      url: `${API_URL}/profiles/location?type=workplace&query=${encodeURIComponent(
        query
      )}`
    };
    const list = await this.makeRequest(request);
    return list;
  }

  async getUniversityList(query = ''): Promise<Array<PsOptionType>> {
    const request = {
      url: `${API_URL}/profiles/location?type=university&query=${encodeURIComponent(
        query
      )}`
    };
    const list = await this.makeRequest(request);
    return list;
  }

  async getPayOptions(): Promise<Array<PayOption>> {
    const request = { url: `${API_URL}/products/pay` };
    const { products } = await this.makeRequest(request);

    return products;
  }

  async payOptionStart(
    appId: string | number,
    data: {
      finalizeType: string;
      id?: string | number;
      paymentType?: string; // 'docusign' | 'coinbase' | 'skip';
    }
  ): Promise<Array<PayProduct>> {
    const request = {
      url: `${API_URL}/applications/${appId}/pay`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const { products } = await this.makeRequest(request);

    return products;
  }

  async payOptionClear(appId: string | number): Promise<void> {
    const request = {
      url: `${API_URL}/applications/${appId}/pay`,
      options: { method: 'DELETE' }
    };
    await this.makeRequest(request);
  }

  async payOptionFinish<T>(appId: string | number): Promise<T> {
    const request = {
      url: `${API_URL}/applications/${appId}/pay`,
      options: { method: 'GET' }
    };
    const { data } = await this.makeRequest(request);

    return data;
  }

  async payOptionSign(
    appId: string | number,
    sign: string,
    ipAddress: string
  ): Promise<{ link?: string; redirect?: string }> {
    let data = { baseUrl: '', redirect: '', sign: '', ipAddress: '' };
    if (typeof window !== 'undefined') {
      data = {
        baseUrl: `${window.location.protocol}//${window.location.host}`,
        redirect: window.location.href,
        sign: sign,
        ipAddress: ipAddress
      };
    }
    const request = {
      url: `${API_URL}/${RESOURCE.APPLICATIONS}/${appId}/${END_POINTS.REQUEST_PAY}`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async payOptionPay(
    appId: string | number,
    docId: string | number,
    options?: { test?: boolean }
  ): Promise<{ redirect?: string }> {
    const { test = false } = options || {};
    const data = {
      test,
      redirect: typeof window !== 'undefined' ? window.location.href : ''
    };
    const request = {
      url: `${API_URL}/applications/${appId}/pay2/${docId}`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async payOpenOptionSign(
    appId: string | number
  ): Promise<{ link?: string; redirect?: string }> {
    let data = { baseUrl: '', redirect: '' };
    if (typeof window !== 'undefined') {
      data = {
        baseUrl: `${window.location.protocol}//${window.location.host}`,
        redirect: window.location.href
      };
    }
    const request = {
      url: `${API_URL}/${RESOURCE.APPLICATIONS}/${appId}/${END_POINTS.REQUEST_PAY}`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async downloadPatentApp(
    appId: string | number,
    title: string
  ): Promise<{ applicationId: string; url: string }> {
    try {
      const jwtToken = await this.auth.getJwtToken();
      const request = {
        url: `${API_URL}/applications/${appId}/pdfTemplate?demo=true&title=${title}`,
        options: {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`
          }
        },
        throwError: true
      };
      return await this.makeRequest(request);
    } catch (error) {
      console.error('Error downloading the patent application:', error);
    }
  }

  async downloadSignDocument(documentId: string | number): Promise<void> {
    const jwtToken = await this.auth.getJwtToken();
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    if (jwtToken) {
      headers.set('Authorization', `Bearer ${jwtToken}`);
    }
    return fetch(`${API_URL}/sign-documents/download/${documentId}`, {
      headers
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url =
          typeof window !== 'undefined' ? window.URL.createObjectURL(blob) : '';
        const a = document.createElement('a');
        a.href = url;
        a.download = 'SignDocument.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
  }

  async voteItem(
    resource: string,
    itemId: string | number,
    type: number,
    params?: GetListParams
  ): Promise<{ likes: number; dislikes: number }> {
    const path =
      resource === 'applications' || resource === 'products'
        ? 'likeDislike'
        : 'vote';
    let resourcePath = resource;
    if (resource === 'products') {
      resourcePath = 'company-products';
    }
    const query = params
      ? `?${queryString.stringify(prepareQueryString(params))}`
      : '';
    const data = { type, itemType: resource };
    const request = {
      url: `${API_URL}/${resourcePath}/${itemId}/${path}${query}`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getInfluencers(itemId) {
    const request = {
      url: `${API_URL}/influencers/getInfluencers/${itemId}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async calculateMultiplierIdeaPoints(data: {
    defaultIdeaPoints: string;
    likes: number;
    dislikes: number;
  }): Promise<any> {
    const request = {
      url: `${API_URL}${PATH_NAMES.REWARDS}${END_POINTS.CALCULATE_MULTIPLIER_IDEA_POINTS}`,
      options: {
        method: 'POST',
        body: JSON.stringify(data)
      }
    };
    const response = await this.makeRequest(request);
    return response;
  }

  async getImproveApp(
    id: string | number,
    entity?: string
  ): Promise<{ coins: { [key: string]: number } }> {
    let entityPath = 'applications';
    if (entity === 'product') {
      entityPath = 'company-products';
    } else if (entity === 'prior-art') {
      entityPath = 'prior-arts';
    }
    const request = {
      url: `${API_URL}/${entityPath}/${id}/vote`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async improveApp(
    id: string | number,
    type: string,
    entity?: string
  ): Promise<{ success: boolean; message?: string }> {
    let entityPath = 'applications';
    if (entity === 'product') {
      entityPath = 'company-products';
    } else if (entity === 'prior-art') {
      entityPath = 'prior-arts';
    }
    const request = {
      url: `${API_URL}/${entityPath}/${id}/vote`,
      options: { method: 'POST', body: JSON.stringify({ type }) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async improveSolution<T>(id: string | number, boost?: any): Promise<T> {
    const request = {
      url: `${API_URL}/solutions/${id}/improve`,
      options: { method: 'POST', body: JSON.stringify(boost) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async globalSearch(query: string, tagsName?: string): Promise<any> {
    const request = {
      url: `${API_URL}/search?q=${query}&t=${tagsName || ''}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async globalSearchEntities(
    query: string,
    page: number = 1,
    limit: number = 10,
    types?: string[]
  ): Promise<GlobalSearchResponse> {
    const params = new URLSearchParams();

    if (page) {
      params.append('page', String(page));
    }
    if (limit) {
      params.append('limit', String(limit));
    }
    if (types && types.length) {
      params.append('types', types.join(','));
    }

    const request = {
      url: `${API_URL}/globalSearch${END_POINTS.GLOBAL_SEARCH}?query=${encodeURIComponent(
        query
      )}&${params.toString()}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async globalSearchGroupedInfluencer(
    query: string,
    page: number = 1,
    limit?: number,
    types?: string[]
  ): Promise<any> {
    const params = new URLSearchParams();
    if (page) {
      params.append('page', String(page));
    }
    if (limit) {
      params.append('limit', String(limit));
    }
    if (types && types.length > 0) {
      params.append('types', types.join(','));
    }

    const request = {
      url: `${API_URL}/globalSearch/influencer/grouped?query=${encodeURIComponent(
        query
      )}&${params.toString()}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async globalSearchFindByType(
    type: string,
    page: number = 1,
    limit: number = 10,
    query?: string
  ): Promise<any> {
    const params = new URLSearchParams();
    if (page) {
      params.append('page', String(page));
    }
    if (limit) {
      params.append('limit', String(limit));
    }
    // Request only the fields we actually need in the UI
    params.append('fields', 'id,title,type,image,isPaid');
    if (query && query.trim()) {
      params.append('query', query.trim());
    }

    const request = {
      url: `${API_URL}/globalSearch/findByType/${encodeURIComponent(
        type
      )}?${params.toString()}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async globalSearchTopItems(isInfluencer?: boolean): Promise<any> {
    const endpoint = isInfluencer
      ? '/globalSearch/influencer/topItems'
      : '/globalSearch/topItems';
    const request = {
      url: `${API_URL}${endpoint}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async addInfluencerRequest(tagId: string): Promise<any> {
    const request = {
      url: `${API_URL}/requests/influencerRequest`,
      options: {
        method: 'POST',
        body: JSON.stringify({ tagId })
      },
      throwError: true
    };
    return this.makeRequest(request);
  }

  async findRequest(params: { tagId: string; type: string }): Promise<any> {
    const request = {
      url: `${API_URL}/requests/findOne`,
      options: {
        method: 'POST',
        body: JSON.stringify(params)
      },
      throwError: false
    };
    return this.makeRequest(request);
  }

  async getInfluencerRequests(tagId: string): Promise<any> {
    const request = {
      url: `${API_URL}/requests/influencerRequests?tagId=${tagId}`,
      options: { method: 'GET' },
      throwError: false
    };
    return this.makeRequest(request);
  }

  async handleInfluencerRequest(
    requestId: string,
    action: 'accept' | 'reject'
  ): Promise<any> {
    const request = {
      url: `${API_URL}/requests/influencerRequest/handle`,
      options: {
        method: 'POST',
        body: JSON.stringify({ requestId, action })
      },
      throwError: true
    };
    return this.makeRequest(request);
  }

  async imageSearch(query: string): Promise<{ url: string }> {
    const request = {
      url: `${API_URL}/search/image?q=${encodeURIComponent(query)}&new=true`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async answerSearch(
    query: string,
    purpose?: string
  ): Promise<{ text: string }> {
    const request = {
      url: `${API_URL}/${RESOURCE.SEARCH}${END_POINTS.ANSWER}?q=${query}&purpose=${purpose}`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async regenerateImage(itemId: number): Promise<{ text: string }> {
    const request = {
      url: `${API_URL}/applications/${itemId}/regenerateImage`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async removeSolutionFromContest(
    contestId: string | number,
    solutionId: string | number
  ): Promise<any> {
    const request = {
      url: `${API_URL}/contests/${contestId}/solutions/${solutionId}`,
      options: { method: 'DELETE' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getImageAndTitle(
    itemId: number,
    generateImage?: boolean
  ): Promise<{ text: string }> {
    const request = {
      url: `${API_URL}/applications/${itemId}/concept?generateImage=${generateImage}`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async refineTitleWithAi(params: any): Promise<{ text: string }> {
    const paramString = createParamString(params);
    const request = {
      url: `${API_URL}/ai/refineTitleWithAi?${paramString}`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async generateConceptScore(itemId: number): Promise<any> {
    const request = {
      url: `${API_URL}/applications/${itemId}/generateConceptScore`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async improveProduct(productId, conceptId): Promise<any> {
    const request = {
      url: `${API_URL}/company-products/${productId}/improveProduct?conceptId=${conceptId}`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async validateCompanyName(name: string): Promise<{ res: boolean }> {
    const request = {
      url: `${API_URL}/ai/validateCompanyName?name=${name}`,
      options: { method: 'POST' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getSolutionRelationship(data, signal = null) {
    const request = {
      url: `${API_URL}/ai/getSolutionRelationship`,
      options: { method: 'POST', body: JSON.stringify(data), signal },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getComponentRelationship(data, signal = null) {
    const request = {
      url: `${API_URL}/ai/getComponentRelationship`,
      options: { method: 'POST', body: JSON.stringify(data), signal },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async generateDescriptionFromAI(payload): Promise<any> {
    const request = {
      url: `${API_URL}/ai/generateDescription`,
      options: { method: 'POST', body: JSON.stringify(payload) },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async generateImageFromAI(payload): Promise<any> {
    const request = {
      url: `${API_URL}/ai/generateImage`,
      options: { method: 'POST', body: JSON.stringify(payload) },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async claimPromoterStatus(payload): Promise<any> {
    const request = {
      url: `${API_URL}/profiles/claimPromoterStatus`,
      options: { method: 'POST', body: JSON.stringify(payload) },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async tagsSearch(
    title: string,
    companyName?: string,
    type?: string
  ): Promise<{ tags: string[] }> {
    const request = {
      url: `${API_URL}/search/tags?title=${title}&companyName=${companyName}&type=${type}`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async deployNft(appId: string | number): Promise<any> {
    const request = {
      url: `${API_URL}/applications/${appId}/deployNft`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async nftDeployStart(appId: string | number): Promise<{
    contractAddress: string;
    contractMarketAddress: string;
    tokenURI: string;
  }> {
    const request = {
      url: `${API_URL}/applications/${appId}/nft`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async nftDeployFinish(
    appId: string | number,
    data: { tokenURI?: string; walletAddress?: string }
  ): Promise<{ nftTransactionUrl: string }> {
    const request = {
      url: `${API_URL}/applications/${appId}/nft`,
      options: { method: 'POST', body: JSON.stringify(data) },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async removeTag(type: string, itemId: string | number, tagKey: string) {
    const request = {
      url: `${API_URL}/${type}/${itemId}/tags/${tagKey}`,
      options: { method: 'DELETE' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async updateTags(type: string, itemId: string | number, tags: Array<string>) {
    const request = {
      url: `${API_URL}/${type}/${itemId}/tags`,
      options: { method: 'POST', body: JSON.stringify({ tags }) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async trackSharing(
    id: string | number,
    resource: string,
    type: string,
    itemType?: string,
    itemId?: string
  ) {
    const request = {
      url: `${API_URL}/profiles/track/sharing`,
      options: {
        method: 'POST',
        body: JSON.stringify({ id, resource, type, itemType, itemId })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getMarketInfo(): Promise<{
    data: {
      networkRpc: string;
      contractAddress: string;
      contractMarketAddress: string;
    };
  }> {
    const request = {
      url: `${API_URL}/profiles/marketInfo`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getContestNFTCount<T>(id: string | number): Promise<T> {
    const request = {
      url: `${API_URL}/contests/${id}/nft`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getUnreadNotificationCount<T>(params?: {
    filter?: { $custom?: any };
  }): Promise<T> {
    const query = params ? prepareQueryString(params) : '';
    const request = {
      url: `${API_URL}/notification/unreadCount${query ? `?${queryString.stringify(query)}` : ''}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async toggleNotificationReadStatus<T>(
    id: string | number | null,
    status: boolean
  ): Promise<T> {
    const request = {
      url: `${API_URL}/notification/toggleReadStatus`,
      options: {
        method: 'POST',
        body: JSON.stringify({ id, status })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async markAllNotificationsAsRead<T>(userId): Promise<T> {
    const request = {
      url: `${API_URL}/notification/markAllAsRead`,
      options: {
        method: 'POST',
        body: JSON.stringify({ userId })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async markMultipleNotificationsAsRead<T>(notificationIds): Promise<T> {
    const request = {
      url: `${API_URL}/notification/markMultipleAsRead`,
      options: {
        method: 'POST',
        body: JSON.stringify({ notificationIds })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getContestTops<T>(id: string | number): Promise<T> {
    const request = {
      url: `${API_URL}/contests/${id}/tops`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getContestTopUsers<T>(id: string | number): Promise<T> {
    const request = {
      url: `${API_URL}/contests/${id}/topUsers`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getChallengeLeaderboard<T>(
    pagination: PaginationPayload,
    filter: any
  ): Promise<{ data: Array<T>; total: number }> {
    const { page, perPage } = pagination;
    const rangeStart = ((page as number) - 1) * (perPage as number);
    const rangeEnd = (page as number) * (perPage as number) - 1;
    const query = {
      range: JSON.stringify([rangeStart, rangeEnd]),
      filter: JSON.stringify(filter)
    };
    const request = {
      url: `${API_URL}/challenges/leaderboard?${queryString.stringify(query)}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getChallengeTopUsers<T>(id: string | number): Promise<T> {
    const request = {
      url: `${API_URL}/challenges/${id}/topUsers`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getChallengeTopTags<T>(id: string | number): Promise<T> {
    const request = {
      url: `${API_URL}/challenges/${id}/topTags`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getUserRanking<T>(
    resource: string,
    params: GetListParams
  ): Promise<GetUserRankResult> {
    const resourceName = this.getResourceName(resource);
    const query = prepareQueryString(params);
    const request = {
      url: `${API_URL}/${resourceName}?${queryString.stringify(query)}`
    };
    const data = await this.makeRequest(request);
    return data?.rank;
  }

  async getUserIdeaPoints<T>(
    resource: string,
    params: GetListParams
  ): Promise<GetUserIdeaPointsResult> {
    const resourceName = this.getResourceName(resource);
    const query = prepareQueryString(params);
    const request = {
      url: `${API_URL}/${resourceName}?${queryString.stringify(query)}`
    };
    const data = await this.makeRequest(request);
    return data.ideaPoints;
  }

  async getProfileItemsCount<T>(
    resource: string,
    params: GetListParams
  ): Promise<GetProfileItemsCount> {
    const resourceName = this.getResourceName(resource);
    const query = prepareQueryString(params);
    const request = {
      url: `${API_URL}/${resourceName}/getCount?${queryString.stringify(query)}`
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getFeedEntitiesCount<T>(filter: object): Promise<any> {
    const paramString = createParamString({ filter });
    const request = {
      url: `${API_URL}/feeds/getFeedEntitiesCount?${paramString}`,
      options: { method: 'GET' }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getChallengeTopContests<T>(id: string | number): Promise<T> {
    const request = {
      url: `${API_URL}/challenges/${id}/topContests`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async addSolutionToProblem<T>(
    id: string | number,
    application: string | number,
    solution: string | number
  ): Promise<T> {
    const request = {
      url: `${API_URL}/problems/${id}/add`,
      options: {
        method: 'POST',
        body: JSON.stringify({ solution, application })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async checkCompanyNameAvailability(name) {
    const request = {
      url: `${API_URL}/chatbot/checkCompanyNameAvaialbility/${name}`,
      options: { method: 'GET' }
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async inviteUser<T>(
    email: string,
    itemType: string,
    itemId: string | number
  ): Promise<T> {
    const request = {
      url: `${API_URL}/auth/invite`,
      options: {
        method: 'POST',
        body: JSON.stringify({ email, itemType, itemId })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async inviteAdmin<T>(key: any): Promise<T> {
    const request = {
      url: `${API_URL}/invite/${key}`,
      options: {
        method: 'GET'
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async inviteClicked<T>(key: any): Promise<T> {
    const request = {
      url: `${API_URL}/invite/${key}`,
      options: {
        method: 'POST'
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async inviteUserSimple<T>(email: string): Promise<T> {
    const request = {
      url: `${API_URL}/auth/invite-simple`,
      options: {
        method: 'POST',
        body: JSON.stringify({ email })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async createAnonymousUser(fingerId: string | number) {
    const request = {
      url: `${API_URL}/anonymousUser/create`,
      options: {
        method: 'POST',
        body: JSON.stringify({ fingerId })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getScore(productName, solutionTitles) {
    const request = {
      url: `${API_URL}/chatbot/getScore`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          productName,
          solutionTitles
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async updateAnonymousData<T>(payload): Promise<T> {
    const request = {
      url: `${API_URL}/anonymousUser/updateData`,
      options: { method: 'PUT', body: JSON.stringify(payload) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async detectIntent(message) {
    const request = {
      url: `${API_URL}/chatbot/detectIntent/${message}`,
      options: {
        method: 'GET'
      }
    };

    const res = await this.makeRequest(request);
    return res;
  }

  async getItemTitles(params) {
    const request = {
      url: `${API_URL}/chatbot/getTitles`,
      options: {
        method: 'POST',
        body: JSON.stringify(params)
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getEntitiesByDimension(params: {
    category: string;
    dimension: string;
    grandParentTitle: string;
    isAnonymousUser: boolean;
    parent: string;
    userId: string;
  }) {
    const request = {
      url: `${API_URL}/${RESOURCE.CHATBOT}${END_POINTS.GET_ENTITIES_BY_DIMENSION}`,
      options: {
        method: 'POST',
        body: JSON.stringify(params)
      },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res?.data;
  }

  async sendMessage(message: string, anonUserId: string) {
    const request = {
      url: `${API_URL}/chatbot/sendMessage`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          message,
          anonUserId
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    };

    const res = await this.makeRequest(request);
    return res;
  }

  async getInfluencerEarningStats(influencerId) {
    const request = {
      url: `${API_URL}/profiles/getInfluencerEarningStats/${influencerId}`,
      options: {
        method: 'GET'
      }
    };

    const res = await this.makeRequest(request);
    return res;
  }

  async registerUser<T>(data: any): Promise<T> {
    const request = {
      url: `${API_URL}/auth/register`,
      options: {
        method: 'POST',
        body: JSON.stringify(data)
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async updateSubscription<T>(
    type: string,
    tagId?: string | number,
    data?: companyTagData
  ): Promise<T> {
    const request = {
      url: `${API_URL}/profiles/subscription`,
      options: {
        method: 'POST',
        body: JSON.stringify({ type, tagId, data })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async initialPaymentSession<T>(
    id,
    redirectURL,
    items,
    pagination,
    patentFileFlow,
    mode = Constants.PAYMENT
  ): Promise<T> {
    const request = {
      url: `${API_URL}/applications/initialPaymentSession/${id}`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          id,
          redirectURL,
          items,
          pagination,
          mode,
          patentFileFlow
        })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async stakerPayment<T>(
    id,
    amount,
    numberOfStake,
    redirectURL,
    items
  ): Promise<T> {
    try {
      const request = {
        url: `${API_URL}/${RESOURCE.CROWDFUNDING_CAMPAIGN}/${Constants.CREATE_CHECKOUT_SEESION}`,
        options: {
          method: Constants.POST,
          body: JSON.stringify({
            applicationId: id,
            amount,
            numberOfStake,
            redirectURL,
            items
          })
        }
      };

      const res = await this.makeRequest(request);
      return res;
    } catch (error) {
      console.error(ERRORS.ERROR_DURING_STAKER_PAYMENT_REQUEST, error);
      throw new Error(ERRORS.FAILED_TO_INITIATE_PAYMENT_SESSION);
    }
  }

  async purchaseCommunity<T>(
    id: string | number,
    amount: number,
    redirectURL: string,
    items
  ): Promise<T> {
    try {
      const request = {
        url: `${API_URL}/${Constants.TAGS}/${Constants.CREATE_CHECKOUT_SEESION}`,
        options: {
          method: Constants.POST,
          body: JSON.stringify({
            tagId: id,
            amount,
            redirectURL,
            items
          })
        }
      };

      const res = await this.makeRequest(request);
      return res;
    } catch (error) {
      console.error(ERRORS.ERROR_DURING_STAKER_PAYMENT_REQUEST, error);
      throw new Error(ERRORS.FAILED_TO_INITIATE_PAYMENT_SESSION);
    }
  }

  async createPurchaseCreditsSession<T>(redirectURL, items): Promise<T> {
    const request = {
      url: `${API_URL}/${RESOURCE.SUBSCRIPTIONS}${END_POINTS.CREATE_PURCHASE_CREDITS_SESSION}`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          redirectURL,
          items
        })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async createIncentiveSession<T>(
    redirectURL,
    items,
    inviteNewUserParms
  ): Promise<T> {
    const request = {
      url: `${API_URL}/${RESOURCE.SUBSCRIPTIONS}/createIncentiveSession`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          redirectURL,
          items,
          inviteNewUserParms
        })
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async updateTagSubscription<T>(
    id: string | number,
    data: {
      termsAgree: boolean;
      title?: string;
      url?: string;
      invites: Array<string>;
    }
  ): Promise<T> {
    const request = {
      url: `${API_URL}/tags/${id}/subscribe`,
      options: {
        method: 'POST',
        body: JSON.stringify(data)
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async applicationSign(
    solutionId: string | number
  ): Promise<{ link?: string; redirect?: string }> {
    const data = {};
    const request = {
      url: `${API_URL}/applications/${solutionId}/sign`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async solutionSign(
    solutionId: string | number
  ): Promise<{ link?: string; redirect?: string }> {
    const data = {};
    const request = {
      url: `${API_URL}/solutions/${solutionId}/sign`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getRelatedNfts<T>(
    resource: string,
    itemId: string | number,
    params?: Partial<GetListParams>
  ): Promise<GetManyResult<T>> {
    const query = prepareQueryString(params || {});
    const request = {
      url: `${API_URL}/${resource}/${itemId}/nfts?${queryString.stringify(
        query
      )}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  // async getRelatedConcepts<T>(
  //   resource: string,
  //   itemId: string | number,
  // ): Promise<T[]> {
  //   const request = {
  //     url: `${API_URL}/${resource}/${itemId}/concepts`,
  //     options: { method: 'GET' },
  //   };
  //   const res = await this.makeRequest(request);
  //   return res;
  // }

  async getConceptsByUserId<T>(
    userId: string | number,
    params: GetListParams
  ): Promise<{ data: Array<T> }> {
    const { field = Constants.CREATED_AT, order = Constants.ASC } =
      params?.sort || {};
    const query = {
      filter: JSON.stringify(params?.filter),
      sort: JSON.stringify([field, order])
    };

    const request = {
      url: `${API_URL}/applications?${queryString.stringify(
        query
      )}&owner=${userId}&isPaid=false`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getRewardsTop<T>(type: string): Promise<{ data: Array<T> }> {
    const request = {
      url: `${API_URL}/rewards/top/${type}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getGroupsTop<T>(): Promise<{ data: Array<T> }> {
    const request = {
      url: `${API_URL}/tags/top`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getGroupRewards(
    id: string | number
  ): Promise<{ data: { total: number } }> {
    const request = {
      url: `${API_URL}/tags/${id}/rewards`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getChartTops<T>(): Promise<{ data: Array<T> }> {
    const request = {
      url: `${API_URL}/tags/chart-top`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async activityFollow(data: {
    subscribe: boolean;
    followerType: 'profile' | 'tag';
    followerId: string | number;
  }): Promise<{ link?: string; redirect?: string }> {
    const request = {
      url: `${API_URL}/activities/follow`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async activityGetUnseen(): Promise<{
    items: Array<ActivitySeen>;
  }> {
    const request = {
      url: `${API_URL}/activities/unseen`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async activityUpdateUnseen(
    id: string | number,
    seen: boolean
  ): Promise<{
    items: Array<ActivitySeen>;
  }> {
    const data = { id, seen };
    const request = {
      url: `${API_URL}/activities/unseen`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async shareToSocialMedia(payload: any): Promise<any> {
    const request = {
      url: `${API_URL}/share/shareToSocialMedia`,
      options: { method: 'POST', body: JSON.stringify(payload) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async influencerShareToSocialMedia(payload: any): Promise<any> {
    const request = {
      url: `${API_URL}/share/influencerShareToSocialMedia`,
      options: { method: 'POST', body: JSON.stringify(payload) },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getCreditsPrices(): Promise<Array<CreditsPrice>> {
    const request = {
      url: `${API_URL}/profiles/credits/prices`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getCreditsHistory(params): Promise<Array<CreditsHistory>> {
    const query = prepareQueryString(params);
    const request = {
      url: `${API_URL}/${RESOURCE.SUBSCRIPTIONS}${END_POINTS.CREDITS_HISTORY}?${queryString.stringify(query)}`,
      options: { method: 'GET' },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async subtractCredits(params: UpdateParams) {
    const request = {
      url: `${API_URL}/${RESOURCE.PROFILES}${END_POINTS.SUBTRACT_CREDITS}/${params.id}`,
      options: { method: 'POST', body: JSON.stringify(params.data) },
      throwError: true
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async buyCredits(
    user: string | number,
    priceId: string,
    priceType: string
  ): Promise<{
    pubKey?: string;
    stripeSessionId?: string;
    coinbaseHostedUrl?: string;
  }> {
    const data = { user, id: priceId, type: priceType, redirect: '' };
    if (typeof window !== 'undefined') {
      data.redirect = window.location.href;
    }

    const request = {
      url: `${API_URL}/profiles/credits/buy`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getPrimaryBillingAddress<T>(id: string | number): Promise<T> {
    const request = {
      url: `${API_URL}/billingAddresses/${id}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async updateBillingAddress<T>(id, data): Promise<T> {
    const request = {
      url: `${API_URL}/billingAddresses/${id}`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async updateCredits<T>(id, data): Promise<any> {
    let res = {};
    try {
      const request = {
        url: `${API_URL}/profiles/credits/${id}/updateCredits`,
        options: { method: 'POST', body: JSON.stringify(data) }
      };
      res = await this.makeRequest(request);
      return { res, error: null };
    } catch (error) {
      throw error?.message ?? 'Internal Server Error';
    }
  }

  async getTermsAndConditionsDoc<T>(data): Promise<any> {
    const request = {
      url: `${API_URL}${PATH_NAMES.USER_AGREEMENTS}/generateAgreementTemplate`,
      options: { method: 'POST', body: JSON.stringify(data) }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getInventionStakerByApplicationId<T>(data): Promise<any> {
    const request = {
      url: `${API_URL}/${RESOURCE.CROWDFUNDING_CAMPAIGN}/${data.applicationId}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getEntitiesForChatBot<T>(
    endpoint: string,
    params: {
      title: string;
      isAnonymousUser: boolean;
      filter?: any;
      type: string;
    }
  ) {
    const paramString = createParamString(params);
    let requestUrl = `${API_URL}/${RESOURCE.CHATBOT}${endpoint}/?${paramString}`;
    const request = {
      url: requestUrl
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async findConceptsBySolution<T>(params: {
    solutionId: string;
    ownerId: string;
  }) {
    const paramString = createParamString(params);
    let requestUrl = `${API_URL}/${RESOURCE.APPLICATIONS}/findBySolution/?${paramString}`;
    const request = {
      url: requestUrl
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async findContestsBySolution<T>(params: { solutionId: string }) {
    let requestUrl = `${API_URL}/${RESOURCE.CONTESTS}/findBySolution/${params.solutionId}`;
    const request = {
      url: requestUrl
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getSurveyByInvention<T>(params: { inventionId: string }) {
    let requestUrl = `${API_URL}/${RESOURCE.MANUFACTURER_SURVEY_QUESTIONS}/getOneByInvention/${params.inventionId}`;
    const request = {
      url: requestUrl
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getSurveyAnswersByInvention<T>(params: { inventionId: string }) {
    let requestUrl = `${API_URL}/${RESOURCE.MANUFACTURER_SURVEY_QUESTIONS}/getAnswers/${params.inventionId}`;
    const request = {
      url: requestUrl
    };
    const data = await this.makeRequest(request);
    return data;
  }

  async getBidDetailsEstimation(payload) {
    const request = {
      url: `${API_URL}/manufacturerSurveyResponse/getBidDetailsEstimation`,
      options: {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async sendEthereum(to: string, amount: number, walletAddress: string) {
    const request = {
      url: `${API_URL}/blockchain/sendEthereum`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          to,
          amount,
          walletAddress
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      },
      throwError: true,
      suppressToast: true
    };

    const res = await this.makeRequest(request);
    return res;
  }

  async sendRoyaltyCoin(to: string, amount: number, walletAddress: string) {
    const request = {
      url: `${API_URL}/blockchain/sendRoyaltyCoin`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          to,
          amount,
          walletAddress
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      },
      throwError: true,
      suppressToast: true
    };

    const res = await this.makeRequest(request);
    return res;
  }

  async approveIdeaCoin(
    spender: string,
    amount: number,
    walletAddress: string
  ) {
    const request = {
      url: `${API_URL}/blockchain/approveIdeaCoin`,
      options: {
        method: 'POST',
        body: JSON.stringify({
          spender,
          amount,
          walletAddress
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      },
      throwError: true,
      suppressToast: true
    };

    const res = await this.makeRequest(request);
    return res;
  }

  _prepareCreateParams(params: any) {
    this._prepareTags(params.data);
  }

  _prepareUpdateParams(params: any) {
    this._prepareTags(params.data);
  }

  _prepareTags(params: { tags: string[]; tagsName: string[] }) {
    const tags: string[] = [];
    const tagsName: string[] = [];

    (params?.tags || []).forEach((tag) => {
      if (tag.startsWith('name_')) {
        tagsName.push(tag.slice(5));
      } else {
        tags.push(tag);
      }
    });
    params.tags = tags;
    params.tagsName = tagsName;
  }
}

export const dataProvider = new DataProvider({ auth });

export default dataProvider;
