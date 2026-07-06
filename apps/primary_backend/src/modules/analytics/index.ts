import jwt from "@elysiajs/jwt";
import Elysia, { t } from "elysia";
import { AnalyticsModel } from "./models";
import { AnalyticsService, getDefaultInterval } from "./service";

const rangeSchema = t.Union([
  t.Literal("24h"),
  t.Literal("7d"),
  t.Literal("30d"),
]);

const intervalSchema = t.Union([
  t.Literal("hour"),
  t.Literal("day"),
]);

const breakdownSchema = t.Union([
  t.Literal("model"),
  t.Literal("provider"),
  t.Literal("api_key"),
]);

export const app = new Elysia({ prefix: "api/v1/analytics" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    })
  )
  .resolve(async ({ cookie: { auth }, status, jwt }) => {
    if (!auth) {
      return status(401);
    }

    const decoded = await jwt.verify(auth.value as string);

    if (!decoded || !decoded.userId) {
      return status(401);
    }

    return {
      userId: decoded.userId as string,
    };
  })
  .get("/", () => ({
    ok: true,
  }))
  .get("/summary", async ({ userId, query }) => {
    const range = query.range ?? "24h";
    const summary = await AnalyticsService.getSummary(Number(userId), range);

    return summary;
  }, {
    query: t.Object({
      range: t.Optional(rangeSchema),
    }),
    response: {
      200: AnalyticsModel.summaryResponseSchema,
    },
  })
  .get("/timeseries", async ({ userId, query }) => {
    const range = query.range ?? "24h";
    const interval = query.interval ?? getDefaultInterval(range);
    const points = await AnalyticsService.getTimeseries(Number(userId), range, interval);

    return {
      points,
    };
  }, {
    query: t.Object({
      range: t.Optional(rangeSchema),
      interval: t.Optional(intervalSchema),
    }),
    response: {
      200: AnalyticsModel.timeseriesResponseSchema,
    },
  })
  .get("/breakdown", async ({ userId, query }) => {
    const range = query.range ?? "24h";
    const by = query.by ?? "model";
    const items = await AnalyticsService.getBreakdown(Number(userId), range, by);

    return {
      items,
    };
  }, {
    query: t.Object({
      range: t.Optional(rangeSchema),
      by: t.Optional(breakdownSchema),
    }),
    response: {
      200: AnalyticsModel.breakdownResponseSchema,
    },
  })
  .get("/errors", async ({ userId, query }) => {
    const range = query.range ?? "24h";
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 10)));
    const errors = await AnalyticsService.getErrors(Number(userId), range, page, pageSize);

    return errors;
  }, {
    query: t.Object({
      range: t.Optional(rangeSchema),
      page: t.Optional(t.Numeric()),
      pageSize: t.Optional(t.Numeric()),
    }),
    response: {
      200: AnalyticsModel.errorsResponseSchema,
    },
  })
  .get("/latency", async ({ userId, query }) => {
    const range = query.range ?? "24h";
    const latency = await AnalyticsService.getLatency(Number(userId), range);

    return latency;
  }, {
    query: t.Object({
      range: t.Optional(rangeSchema),
    }),
    response: {
      200: AnalyticsModel.latencyResponseSchema,
    },
  });
