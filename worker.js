import { onRequest } from "./functions/api/[[path]].js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return onRequest({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  },
};
