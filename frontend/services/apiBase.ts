// Shared base URL resolution used by both api.ts and auth.ts
let BASE_URL: string;

if (localStorage.getItem("api-port-override")) {
  BASE_URL = localStorage.getItem("api-port-override") as string;
} else {
  BASE_URL = import.meta.env.VITE_API_URL as string;
}

export { BASE_URL };
