import axios from "axios";
import { omit } from "lodash-es";

export class AxiosClient {
  constructor(baseURL = "") {
    this._instance = axios.create({
      baseURL,
      withCredentials: true,
    });
  }

  /** api 요청 통합 처리 */
  async apiCall(method, url, options) {
    const res = await this._instance.request(
      this._createRequest(method, url, options)
    );
    return res.data;
  }

  /** request 옵션 생성 */
  _createRequest(method, url, options) {
    const { defaults } = this._instance;

    options = {
      method,
      url,
      ...omit(defaults, "headers"),
      data: options?.data,
      params: options?.params,
    };
    options.headers = {
      "content-type": "application/json",
      ...defaults.headers[method],
      ...options.headers,
    };

    return options;
  }

  /** get 요청 */
  get(url, options) {
    return this.apiCall("get", url, options);
  }

  /** post 요청 */
  post(url, options) {
    return this.apiCall("post", url, options);
  }

  /** get 요청 */
  put(url, options) {
    return this.apiCall("put", url, options);
  }

  /** patch 요청 */
  patch(url, options) {
    return this.apiCall("patch", url, options);
  }

  /** delete 요청 */
  delete(url, options) {
    return this.apiCall("delete", url, options);
  }
}

/** 통신용 인스턴스 생성 */
export default new AxiosClient();
