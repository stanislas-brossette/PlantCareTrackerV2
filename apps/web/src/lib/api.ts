import axios from "axios";
import { getApiBaseUrl } from "./serverConfig";

const api = axios.create({
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  return config;
});

export default api;
