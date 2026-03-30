import axios from "axios";
import { getApiBaseUrl } from "./serverConfig";

const api = axios.create({
  withCredentials: false,
  timeout: 4000,
});

api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  return config;
});

export default api;
