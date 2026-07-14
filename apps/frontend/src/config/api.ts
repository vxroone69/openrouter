declare const __PRIMARY_BACKEND_URL__: string | undefined;
declare const __API_BACKEND_URL__: string | undefined;

export const primaryBackendUrl =
    typeof __PRIMARY_BACKEND_URL__ === "string"
        ? __PRIMARY_BACKEND_URL__
        : "http://localhost:3000";

export const apiBackendUrl =
    typeof __API_BACKEND_URL__ === "string"
        ? __API_BACKEND_URL__
        : "http://localhost:3002";
