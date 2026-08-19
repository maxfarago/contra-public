// Axios client configuration
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000/v1",
  withCredentials: true,
});

export const atlasApi = axios.create({
  baseURL: import.meta.env.VITE_ATLAS_API_URL || "http://127.0.0.1:4242",
  withCredentials: true,
});

