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
  const { page = 1, perPage = 10 } = params.pagination || {};
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
    rangeStart = ((page as number) - 1) * (perPage as number);
    rangeEnd = (page as number) * (perPage as number) - 1;
  }
  const query = {
    sort: JSON.stringify([field, order]),
    range: JSON.stringify([rangeStart, rangeEnd]),
    filter: JSON.stringify(params.filter)
  };
  return query;
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
        error.status == 500 ? ERRORS.UNEXPECTED_ERROR : error.message;

      const isUnauthorized = error.status == 401;
      if (isUnauthorized) {
        removeToken();
      }
      if (isUnauthorized || request.throwError) {
        toastify(
          errorMsg,
          VARIANT.ERROR,
          VARIANT.TOP_CENTER,
          TOASTIFY_DURATION
        );
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

  async inviteNewUser(payload: any) {
    try {
      const { nftInvitation, inventionId, inventionName, ...rest } = payload;
      const jwtToken = await this.auth.getJwtToken();
      const response = await fetch(
        `${API_URL}/auth${PATH_NAMES.ADMIN_INVITE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`
          },
          body: JSON.stringify({ payload: rest })
        }
      );
      const newProfile: any = await response.json();

      let newOpportunity: any = {};
      let newInventionOpportunity = {};

      if (newProfile && nftInvitation) {
        const createOpportunity = async (payload) => {
          const { contactId, contactName, inventionName } = payload;
          const url = 'https://services.leadconnectorhq.com/opportunities/';
          const method = 'POST';
          const data = {
            pipelineId: 'drAGRmZoG9soulqUwuDj',
            locationId: 'eU79bySeXP9RYLi7Yv49',
            name: contactName,
            pipelineStageId: '8c7c2ec0-f7a3-4e3e-aed8-a6f63122b235',
            status: 'open',
            contactId: contactId,
            customFields: [
              {
                id: 'LuR5ik5KMX2KEmmeJNJD',
                key: 'opportunity.invention_name',
                field_value: inventionName
              }
            ]
          };

          const apiCall = await fetch(url, {
            method: method,
            headers: {
              Authorization: `Bearer pit-f494bbb6-9957-4c6b-a52e-4deae143d8db`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Version: '2021-07-28'
            },
            body: JSON.stringify(data)
          });

          return apiCall.json();
        };
        newOpportunity = await createOpportunity({
          contactId: newProfile.contactId,
          contactName: newProfile.username,
          inventionName: inventionName
        });
        const request = {
          url: `${API_URL}/inventionOpportunity`,
          options: {
            method: 'POST',
            body: JSON.stringify({
              ghlContactId: newProfile.contactId,
              profileId: newProfile.id,
              opportunityId: newOpportunity.opportunity.id,
              inventionId,
              status: 'stage1'
            })
          }
        };
        newInventionOpportunity = await this.makeRequest(request);
      }

      return { newProfile, newOpportunity, newInventionOpportunity };
    } catch (error) {
      console.error(ERRORS.INVITE_USER_ERROR, error);
      throw new Error(ERRORS.ERROR_SENDING_INVITE);
    }
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

  async getOne<T>(resource: string, params: GetOneParams) {
    const resourceName = this.getResourceName(resource);
    const request = { url: `${API_URL}/${resourceName}/${params.id}` };
    const data = await this.makeRequest(request);
    return { data };
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

  async getMany<T>(
    resource: string,
    params: GetManyParams
  ): Promise<GetManyResult<T>> {
    const resourceName = this.getResourceName(resource);
    const query = {
      filter: JSON.stringify({ id: params.ids })
    };
    const request = {
      url: `${API_URL}/${resourceName}?${queryString.stringify(query)}`
    };
    const data = await this.makeRequest(request);
    return {
      data: data.data,
      total: data.total
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

  async createComponent(data): Promise<any> {
    const request = {
      url: `${API_URL}${END_POINTS.CREATE_COMPONENT}`,
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
      url: `${API_URL}/${resourceName}/${params.key}/${
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
  async processVideoExample(resource: string, id) {
    try {
      const resourceName = this.getResourceName(resource);
      const query = {
        filter: JSON.stringify({ id: id })
      };
      const request = {
        url: `${API_URL}/${resourceName}/getVideo?${queryString.stringify(
          query
        )}`,
        throwError: true
      };
      const res = await this.makeRequest(request);
      return res;
    } catch (error) {
      console.error('Error processing video:', error);
      throw error;
    }
  }

  async getOwnedCommunity(userId) {
    const request = {
      url: `${API_URL}/${RESOURCE.TAGS}${END_POINTS.GET_USER_OWNED_COMMUNITY}/${userId}`,
      options: { method: 'GET' }
    };
    const res = await this.makeRequest(request);
    return res;
  }

  async getFollowingTagsCount(userKey, onlyCount) {
    let url = `${API_URL}/${Constants.TAGS}/${Constants.GET_FOLLOWING_TAGS}?onlyCount=${onlyCount}&userKey=${userKey}`;
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
      url: `${API_URL}${PATH_NAMES.REWARDS}${END_POINTS.DISTRIBUTE_MATIC_REWARD}`,
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

  async nftApproval<T>(tokenId: string) {
    console.log(`Making request to: ${API_URL}${END_POINTS.APPROVE_NFT}`);
    const request = {
      url: `${API_URL}${END_POINTS.APPROVE_NFT}`, 
      options: {
        method: 'POST',
        body: JSON.stringify({tokenId})
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async listFixedNft(tokenId: string, listPrice: BigNumber) {
    console.log(`Making request to: ${API_URL}${END_POINTS.LIST_FIXED_NFT}`);
    const request = {
      url: `${API_URL}/${END_POINTS.LIST_FIXED_NFT}`,
      options: {              
        method: 'POST',
        body: JSON.stringify({tokenId, listPrice})
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async cancelFixedNft(tokenId: string) {
    console.log(`Making request to: ${API_URL}${END_POINTS.CANCEL_FIXED_NFT}`);
    const request = {
      url: `${API_URL}${END_POINTS.CANCEL_FIXED_NFT}`,
      options: {              
        method: 'POST',
        body: JSON.stringify({tokenId})
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return { data };
  }

  async BuyFixedNft(tokenId: string, priceOfNft: object) {
    console.log(`Making request to: ${API_URL}${END_POINTS.BUY_FIXED_NFT}`);
    const request = {
      url: `${API_URL}${END_POINTS.BUY_FIXED_NFT}`,
      options: {
        method: 'POST',
        body: JSON.stringify({tokenId, priceOfNft})
      },
      throwError: true
    };
    const data = await this.makeRequest(request);
    return { data };
  }

}

export const dataProvider = new DataProvider({ auth });

export default dataProvider;
